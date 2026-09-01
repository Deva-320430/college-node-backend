import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { protect, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();

const updateStudentSchema = z.object({
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});

router.get('/me', protect, async (req: AuthRequest, res) => {
  const student = await prisma.studentProfile.findUnique({
    where: { userId: req.user!.userId },
    include: {
      user: { include: { role: true } },
      department: true,
      course: true,
      currentSemester: true,
      academicYear: true,
    },
  });

  if (!student) {
    return res.status(404).json({ message: 'Student profile not found.' });
  }

  return res.json(student);
});

router.get('/:id', protect, async (req: AuthRequest, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = req.user!;

  if (user.role !== 'STUDENT' || user.userId !== id) {
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'CHAIRMAN') {
      return res.status(403).json({ message: 'You do not have permission to view this profile.' });
    }
  }

  const student = await prisma.studentProfile.findUnique({
    where: { id },
    include: {
      user: { include: { role: true } },
      department: true,
      course: true,
      currentSemester: true,
      academicYear: true,
    },
  });

  if (!student) {
    return res.status(404).json({ message: 'Student not found.' });
  }

  return res.json(student);
});

router.put('/:id', protect, requireRole('ADMIN', 'SUPER_ADMIN', 'STUDENT'), async (req: AuthRequest, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = updateStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid student update payload.' });
  }

  const user = req.user!;
  if (user.role === 'STUDENT' && user.userId !== id) {
    return res.status(403).json({ message: 'Students can only update their own record.' });
  }

  const student = await prisma.studentProfile.findUnique({ where: { id } });
  if (!student) {
    return res.status(404).json({ message: 'Student not found.' });
  }

  const updated = await prisma.studentProfile.update({
    where: { id },
    data: parsed.data,
  });

  return res.json(updated);
});

router.get('/:id/results', protect, async (req: AuthRequest, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const student = await prisma.studentProfile.findUnique({ where: { id } });
  if (!student) {
    return res.status(404).json({ message: 'Student not found.' });
  }

  const marks = await prisma.mark.findMany({
    where: { studentId: student.id },
    include: { subject: true, semester: true },
  });

  return res.json(marks);
});

router.get('/:id/attendance', protect, async (req: AuthRequest, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const student = await prisma.studentProfile.findUnique({ where: { id } });
  if (!student) {
    return res.status(404).json({ message: 'Student not found.' });
  }

  const attendance = await prisma.attendance.findMany({
    where: { studentId: student.id },
    include: { subject: true },
  });

  return res.json(attendance);
});

export default router;
