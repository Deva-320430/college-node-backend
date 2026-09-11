import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { protect, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();

const allowedRoles = ['SUPER_ADMIN', 'CHAIRMAN', 'ADMIN', 'EXAM_CELL'];

/* ------------------------------------------------------------------ */
/* Regulations                                                         */
/* ------------------------------------------------------------------ */

router.get('/regulations', protect, requireRole(...allowedRoles), async (_req: AuthRequest, res) => {
  const regulations = await prisma.regulation.findMany({
    include: {
      subjects: {
        select: {
          id: true,
          code: true,
          name: true,
          credits: true,
          departmentId: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({
    regulations: regulations.map((reg) => ({
      id: reg.id,
      name: reg.name,
      subjectCount: reg.subjects.length,
      departments: Array.from(new Set(reg.subjects.map((s) => s.departmentId))).length,
    })),
  });
});

const createRegulationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Regulation name is required.')
    .transform((v) => v.toUpperCase()),
});

router.post('/regulations', protect, requireRole(...allowedRoles), async (req: AuthRequest, res) => {
  const parsed = createRegulationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid regulation payload.' });
  }

  const name = parsed.data.name;

  const existing = await prisma.regulation.findUnique({ where: { name } });
  if (existing) {
    return res.status(409).json({ message: 'A regulation with that name already exists.' });
  }

  let regulation: { id: string; name: string };
  try {
    regulation = await prisma.regulation.create({ data: { name } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'A regulation with that name already exists.' });
    }
    throw error;
  }

  return res.status(201).json({
    message: 'Regulation added successfully.',
    regulation: { id: regulation.id, name: regulation.name },
  });
});

router.delete('/regulations/:id', protect, requireRole(...allowedRoles), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const regulationId = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!regulationId) return res.status(400).json({ message: 'Regulation ID is required.' });

  const regulation = await prisma.regulation.findUnique({
    where: { id: regulationId },
    include: { subjects: { select: { id: true } } },
  });
  if (!regulation) return res.status(404).json({ message: 'Regulation not found.' });

  if (regulation.subjects.length > 0) {
    return res.status(409).json({
      message: `Cannot delete: this regulation still has ${regulation.subjects.length} subject(s). Remove them first.`,
    });
  }

  await prisma.regulation.delete({ where: { id: regulationId } });
  return res.json({ message: 'Regulation deleted successfully.' });
});

/* ------------------------------------------------------------------ */
/* Subjects                                                            */
/* ------------------------------------------------------------------ */

router.get('/:regulationId/subjects', protect, requireRole(...allowedRoles), async (req: AuthRequest, res) => {
  const rawRegulationId = req.params.regulationId;
  const regulationId = typeof rawRegulationId === 'string' ? rawRegulationId : rawRegulationId?.[0];
  if (!regulationId) return res.status(400).json({ message: 'Regulation ID is required.' });

  const regulation = await prisma.regulation.findUnique({ where: { id: regulationId } });
  if (!regulation) return res.status(404).json({ message: 'Regulation not found.' });

  const departmentId = req.query.departmentId as string | undefined;

  const subjects = await prisma.subject.findMany({
    where: {
      regulationId,
      ...(departmentId ? { departmentId } : {}),
    },
    include: {
      department: { select: { id: true, code: true, name: true } },
      regulation: { select: { id: true, name: true } },
    },
    orderBy: { code: 'asc' },
  });

  return res.json({
    regulation: { id: regulation.id, name: regulation.name },
    subjects,
  });
});

const createSubjectSchema = z.object({
  departmentId: z.string().min(1, 'Please select a department.'),
  courseId: z.string().optional(),
  year: z
    .string()
    .trim()
    .min(1, 'Year is required.')
    .transform((v) => v.toUpperCase()),
  semester: z
    .string()
    .trim()
    .min(1, 'Semester is required.')
    .transform((v) => v.toUpperCase()),
  code: z
    .string()
    .trim()
    .min(1, 'Subject code is required.')
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, 'Subject name is required.'),
  credits: z.coerce.number().int().positive('Credits must be a positive number.'),
});

router.post('/:regulationId/subjects', protect, requireRole(...allowedRoles), async (req: AuthRequest, res) => {
  const rawRegulationId = req.params.regulationId;
  const regulationId = typeof rawRegulationId === 'string' ? rawRegulationId : rawRegulationId?.[0];
  if (!regulationId) return res.status(400).json({ message: 'Regulation ID is required.' });

  const parsed = createSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid subject payload.' });
  }

  const { departmentId, courseId, year, semester, code, name, credits } = parsed.data;

  // Validate the course exists when provided
  if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ message: 'Course not found.' });
  }

  const regulation = await prisma.regulation.findUnique({ where: { id: regulationId } });
  if (!regulation) return res.status(404).json({ message: 'Regulation not found.' });

  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) return res.status(404).json({ message: 'Department not found.' });

  const duplicate = await prisma.subject.findUnique({
    where: { code_regulationId_departmentId: { code, regulationId, departmentId } },
  });
  if (duplicate) {
    return res.status(409).json({
      message: `A subject with code "${code}" already exists in ${regulation.name} for this department.`,
    });
  }

  let subject;
  try {
    subject = await prisma.subject.create({
      data: { year, semester, code, name, credits, regulationId, departmentId, ...(courseId ? { courseId } : {}) },
      include: {
        department: { select: { id: true, code: true, name: true } },
        regulation: { select: { id: true, name: true } },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({
        message: `A subject with code "${code}" already exists in ${regulation.name} for this department.`,
      });
    }
    throw error;
  }

  return res.status(201).json({
    message: 'Subject added successfully.',
    subject,
  });
});

const updateSubjectSchema = z.object({
  departmentId: z.string().min(1, 'Please select a department.').optional(),
  courseId: z.string().optional(),
  year: z
    .string()
    .trim()
    .min(1, 'Year is required.')
    .transform((v) => v.toUpperCase())
    .optional(),
  semester: z
    .string()
    .trim()
    .min(1, 'Semester is required.')
    .transform((v) => v.toUpperCase())
    .optional(),
  code: z.string().trim().min(1, 'Subject code is required.').optional(),
  name: z.string().trim().min(1, 'Subject name is required.').optional(),
  credits: z.coerce.number().int().positive('Credits must be a positive number.').optional(),
});

router.patch('/subjects/:id', protect, requireRole(...allowedRoles), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const subjectId = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!subjectId) return res.status(400).json({ message: 'Subject ID is required.' });

  const parsed = updateSubjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid subject payload.' });

  const { departmentId, courseId, year, semester, code, name, credits } = parsed.data;
  if (!departmentId && !year && !semester && !code && !name && !courseId && credits === undefined) {
    return res.status(400).json({ message: 'Nothing to update.' });
  }

  if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ message: 'Course not found.' });
  }

  const existing = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: { regulation: { select: { id: true, name: true } } },
  });
  if (!existing) return res.status(404).json({ message: 'Subject not found.' });

  if (code && (code !== existing.code || (departmentId && departmentId !== existing.departmentId))) {
    const targetDepartmentId = departmentId ?? existing.departmentId;
    const duplicate = await prisma.subject.findUnique({
      where: {
        code_regulationId_departmentId: { code, regulationId: existing.regulationId, departmentId: targetDepartmentId },
      },
    });
    if (duplicate && duplicate.id !== subjectId) {
      return res.status(409).json({
        message: `A subject with code "${code}" already exists in ${existing.regulation.name} for this department.`,
      });
    }
  }

  let subject;
  try {
    subject = await prisma.subject.update({
      where: { id: subjectId },
      data: {
        ...(departmentId ? { departmentId } : {}),
        ...(courseId ? { courseId } : {}),
        ...(year ? { year } : {}),
        ...(semester ? { semester } : {}),
        ...(code ? { code } : {}),
        ...(name ? { name } : {}),
        ...(credits !== undefined ? { credits } : {}),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        regulation: { select: { id: true, name: true } },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'A subject with that code already exists in this regulation and department.' });
    }
    throw error;
  }

  return res.json({
    message: 'Subject updated successfully.',
    subject,
  });
});

router.delete('/subjects/:id', protect, requireRole(...allowedRoles), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const subjectId = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!subjectId) return res.status(400).json({ message: 'Subject ID is required.' });

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) return res.status(404).json({ message: 'Subject not found.' });

  await prisma.subject.delete({ where: { id: subjectId } });
  return res.json({ message: 'Subject deleted successfully.' });
});

export default router;
