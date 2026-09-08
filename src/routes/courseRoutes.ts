import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { protect, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (_req: AuthRequest, res) => {
  const courses = await prisma.course.findMany({
    include: {
      departments: { select: { id: true, code: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });

  return res.json({ courses });
});

const createCourseSchema = z.object({
  code: z.string().min(1, 'Course code is required.'),
  name: z.string().min(1, 'Course name is required.'),
  duration: z.coerce.number().int().min(1, 'Duration must be at least 1.'),
});

router.post('/', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid course payload.' });
  }

  const { code, name, duration } = parsed.data;

  const existing = await prisma.course.findUnique({ where: { code } });
  if (existing) {
    return res.status(409).json({ message: 'A course with that code already exists.' });
  }

  let course: { id: string; code: string; name: string; duration: number };
  try {
    course = await prisma.course.create({
      data: { code, name, duration },
    });
  } catch (error) {
    // Race between the duplicate-code check above and this insert → still surface a clean 409.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'A course with that code already exists.' });
    }
    throw error;
  }

  return res.status(201).json({
    message: 'Course created successfully.',
    course: { id: course.id, code: course.code, name: course.name, duration: course.duration, departments: [] },
  });
});

router.delete('/:id', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const courseId = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!courseId) return res.status(400).json({ message: 'Course ID is required.' });

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { subjects: { select: { id: true } } },
  });
  if (!course) return res.status(404).json({ message: 'Course not found.' });

  if (course.subjects.length > 0) {
    return res.status(409).json({
      message: `Cannot delete: this course still has ${course.subjects.length} subject(s) attached. Remove them first.`,
    });
  }

  await prisma.course.delete({ where: { id: courseId } });
  return res.json({ message: 'Course deleted successfully.' });
});

const assignDepartmentSchema = z.object({
  departmentId: z.string().min(1, 'Department ID is required.'),
});

router.post('/:id/departments', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const courseId = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!courseId) return res.status(400).json({ message: 'Course ID is required.' });

  const parsed = assignDepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid department payload.' });
  }

  const { departmentId } = parsed.data;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return res.status(404).json({ message: 'Course not found.' });

  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) return res.status(404).json({ message: 'Department not found.' });

  const alreadyAssigned = await prisma.course.findFirst({
    where: { id: courseId, departments: { some: { id: departmentId } } },
  });
  if (alreadyAssigned) {
    return res.status(409).json({ message: 'This department is already assigned to the course.' });
  }

  await prisma.course.update({
    where: { id: courseId },
    data: { departments: { connect: { id: departmentId } } },
  });

  return res.status(201).json({
    message: 'Department added to course.',
    department: { id: department.id, code: department.code, name: department.name },
  });
});

router.delete('/:id/departments/:departmentId', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawCourseId = req.params.id;
  const rawDepartmentId = req.params.departmentId;
  const courseId = typeof rawCourseId === 'string' ? rawCourseId : rawCourseId?.[0];
  const departmentId = typeof rawDepartmentId === 'string' ? rawDepartmentId : rawDepartmentId?.[0];
  if (!courseId || !departmentId) return res.status(400).json({ message: 'Course ID and department ID are required.' });

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return res.status(404).json({ message: 'Course not found.' });

  await prisma.course.update({
    where: { id: courseId },
    data: { departments: { disconnect: { id: departmentId } } },
  });

  return res.json({ message: 'Department removed from course.' });
});

export default router;
