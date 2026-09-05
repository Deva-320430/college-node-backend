import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { protect, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (_req: AuthRequest, res) => {
  const departments = await prisma.department.findMany({
    include: {
      courses: {
        select: { id: true, code: true, name: true, duration: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return res.json({
    departments: departments.map((dept) => ({
      id: dept.id,
      code: dept.code,
      name: dept.name,
      courses: dept.courses,
    })),
  });
});

const createDepartmentSchema = z.object({
  code: z.string().min(1, 'Department code is required.'),
  name: z.string().min(1, 'Department name is required.'),
});

const createCourseSchema = z.object({
  code: z.string().min(1, 'Course code is required.'),
  name: z.string().min(1, 'Course name is required.'),
  duration: z.coerce.number().int().min(1, 'Duration must be at least 1.'),
});

router.post('/', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const parsed = createDepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid department payload.' });
  }

  const { code, name } = parsed.data;

  const existing = await prisma.department.findFirst({ where: { OR: [{ code }, { name }] } });
  if (existing) {
    return res.status(409).json({ message: 'A department with that code or name already exists.' });
  }

  const department = await prisma.department.create({ data: { code, name } });

  return res.status(201).json({
    message: 'Department created successfully.',
    department: { id: department.id, code: department.code, name: department.name, courses: [] },
  });
});

router.post('/:id/courses', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const departmentId = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!departmentId) return res.status(400).json({ message: 'Department ID is required.' });

  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid course payload.' });
  }

  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    return res.status(404).json({ message: 'Department not found.' });
  }

  const { code, name, duration } = parsed.data;

  const existing = await prisma.course.findUnique({ where: { code } });
  if (existing) {
    return res.status(409).json({ message: 'A course with that code already exists.' });
  }

  let course: { id: string; code: string; name: string; duration: number };
  try {
    course = await prisma.course.create({
      data: { code, name, duration, departmentId },
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
    course: { id: course.id, code: course.code, name: course.name, duration: course.duration },
  });
});

router.delete('/:id/courses/:courseId', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawDepartmentId = req.params.id;
  const rawCourseId = req.params.courseId;
  const departmentId = typeof rawDepartmentId === 'string' ? rawDepartmentId : rawDepartmentId?.[0];
  const courseId = typeof rawCourseId === 'string' ? rawCourseId : rawCourseId?.[0];
  if (!departmentId || !courseId) return res.status(400).json({ message: 'Department ID and course ID are required.' });

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { subjects: { select: { id: true } } },
  });

  if (!course || course.departmentId !== departmentId) {
    return res.status(404).json({ message: 'Course not found in this department.' });
  }

  if (course.subjects.length > 0) {
    return res.status(409).json({
      message: `Cannot delete: this course still has ${course.subjects.length} subject(s) attached. Remove them first.`,
    });
  }

  await prisma.course.delete({ where: { id: courseId } });
  return res.json({ message: 'Course deleted successfully.' });
});

const updateDepartmentSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

router.patch('/:id', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const departmentId = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!departmentId) return res.status(400).json({ message: 'Department ID is required.' });

  const parsed = updateDepartmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid department payload.' });

  const { code, name } = parsed.data;
  if (!code && !name) return res.status(400).json({ message: 'Nothing to update.' });

  const conflict = await prisma.department.findFirst({
    where: {
      id: { not: departmentId },
      OR: [code ? { code } : undefined, name ? { name } : undefined].filter(Boolean) as any,
    },
  });
  if (conflict) return res.status(409).json({ message: 'Another department already uses that code or name.' });

  const department = await prisma.department.update({
    where: { id: departmentId },
    data: {
      ...(code ? { code } : {}),
      ...(name ? { name } : {}),
    },
  });

  return res.json({
    message: 'Department updated successfully.',
    department: { id: department.id, code: department.code, name: department.name },
  });
});

router.delete('/:id', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const departmentId = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!departmentId) return res.status(400).json({ message: 'Department ID is required.' });

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    include: { teachers: true, courses: true, students: true, staff: true },
  });
  if (!department) return res.status(404).json({ message: 'Department not found.' });

  // after
  const blockers: string[] = [];
  if (department.teachers.length > 0) blockers.push(`${department.teachers.length} teacher(s)`);
  if (department.courses.length > 0) blockers.push(`${department.courses.length} course(s)`);
  if (department.students.length > 0) blockers.push(`${department.students.length} student(s)`);
  if (department.staff.length > 0) blockers.push(`${department.staff.length} staff member(s)`);

  if (blockers.length > 0) {
    return res.status(409).json({ message: `Cannot delete: this department still has ${blockers.join(', ')} attached. Remove or reassign them first.` });
  }

  await prisma.department.delete({ where: { id: departmentId } });
  return res.json({ message: 'Department deleted successfully.' });
});

export default router;