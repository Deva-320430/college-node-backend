import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { protect, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();

const staffRoles = ['SUPER_ADMIN', 'CHAIRMAN', 'ADMIN', 'EXAM_CELL', 'ACCOUNTANT'];

const feeInclude = {
  student: {
    select: {
      id: true,
      rollNumber: true,
      user: { select: { firstName: true, lastName: true, collegeId: true } },
    },
  },
  category: { select: { id: true, name: true } },
} as const;

/* ------------------------------------------------------------------ */
/* Staff: list all fee entries                                         */
/* ------------------------------------------------------------------ */

router.get('/', protect, requireRole(...staffRoles), async (_req: AuthRequest, res) => {
  const fees = await prisma.fee.findMany({
    include: feeInclude,
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ fees });
});

/* ------------------------------------------------------------------ */
/* Student: view their own fee entries                                 */
/* ------------------------------------------------------------------ */

router.get('/me', protect, async (req: AuthRequest, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!profile) return res.status(404).json({ message: 'Student profile not found.' });

  const fees = await prisma.fee.findMany({
    where: { studentId: profile.id },
    include: { category: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ fees });
});

/* ------------------------------------------------------------------ */
/* Fee categories                                                      */
/* ------------------------------------------------------------------ */

router.get('/categories', protect, requireRole(...staffRoles), async (_req: AuthRequest, res) => {
  const categories = await prisma.feeCategory.findMany({ orderBy: { name: 'asc' } });
  return res.json({ categories });
});

/* ------------------------------------------------------------------ */
/* Students for the fee entry dropdown                                 */
/* ------------------------------------------------------------------ */

router.get('/students', protect, requireRole(...staffRoles), async (_req: AuthRequest, res) => {
  const students = await prisma.studentProfile.findMany({
    include: {
      user: { select: { firstName: true, lastName: true, collegeId: true } },
      department: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({
    students: students.map((s) => ({
      id: s.id,
      rollNumber: s.rollNumber,
      studentId: s.studentId,
      name: `${s.user.firstName} ${s.user.lastName}`.trim(),
      collegeId: s.user.collegeId,
      department: s.department ? `${s.department.code} — ${s.department.name}` : null,
    })),
  });
});

/* ------------------------------------------------------------------ */
/* Create a fee entry                                                  */
/* ------------------------------------------------------------------ */

const createFeeSchema = z.object({
  studentId: z.string().min(1, 'Please select a student.'),
  categoryId: z.string().min(1, 'Please select a category.').nullable().optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0.'),
  dueDate: z.string().nullable().optional(),
});

router.post('/', protect, requireRole(...staffRoles), async (req: AuthRequest, res) => {
  const parsed = createFeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid fee payload.' });
  }

  const { studentId, categoryId, amount, dueDate } = parsed.data;

  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) return res.status(404).json({ message: 'Student not found.' });

  if (categoryId) {
    const category = await prisma.feeCategory.findUnique({ where: { id: categoryId } });
    if (!category) return res.status(404).json({ message: 'Fee category not found.' });
  }

  const fee = await prisma.fee.create({
    data: {
      studentId,
      categoryId: categoryId ?? null,
      amount,
      paidAmount: 0,
      pendingAmount: amount,
      status: 'PENDING',
      dueDate: dueDate ? new Date(dueDate) : null,
    },
    include: feeInclude,
  });

  return res.status(201).json({ message: 'Fee entry added successfully.', fee });
});

/* ------------------------------------------------------------------ */
/* Delete a fee entry                                                  */
/* ------------------------------------------------------------------ */

router.delete('/:id', protect, requireRole(...staffRoles), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const id = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!id) return res.status(400).json({ message: 'Fee entry ID is required.' });

  const fee = await prisma.fee.findUnique({ where: { id } });
  if (!fee) return res.status(404).json({ message: 'Fee entry not found.' });

  await prisma.fee.delete({ where: { id } });
  return res.json({ message: 'Fee entry deleted successfully.' });
});

export default router;