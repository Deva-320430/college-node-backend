import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken } from '../utils/jwt';
import { protect, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  collegeId: z.string().min(3),
  password: z.string().min(6),
});

const registerSchema = z.object({
  username: z.string().min(3),
  collegeId: z.string().min(3),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid login payload.' });
  }

  const { collegeId, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ collegeId }, { username: collegeId }, { email: collegeId }],
    },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = signToken({
    userId: user.id,
    username: user.username,
    role: user.role.name,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      collegeId: user.collegeId,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
    },
  });
});

router.get('/users', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const allowedRoles = req.user!.role === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']
    : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];

  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: 'desc' },
  });

  const filteredUsers = users.filter((user) => allowedRoles.includes(user.role.name));

  return res.json({
    users: filteredUsers.map((user) => ({
      id: user.id,
      collegeId: user.collegeId,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
    })),
  });
});

router.post('/register', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid user payload.' });
  }

  const { username, collegeId, email, firstName, lastName, password, role } = parsed.data;
  const allowedRoles = req.user!.role === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']
    : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ message: 'You are not allowed to create this role.' });
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { collegeId }, { email }],
    },
  });

  if (existingUser) {
    return res.status(409).json({ message: 'User with the same username, email, or college ID already exists.' });
  }

  const roleRecord = await prisma.role.findUnique({ where: { name: role } });
  if (!roleRecord) {
    return res.status(400).json({ message: 'Invalid role selected.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const createdUser = await prisma.user.create({
    data: {
      username,
      collegeId,
      email,
      firstName,
      lastName,
      passwordHash,
      roleId: roleRecord.id,
      isActive: true,
    },
    include: { role: true },
  });

  return res.status(201).json({
    message: 'User created successfully.',
    user: {
      id: createdUser.id,
      username: createdUser.username,
      collegeId: createdUser.collegeId,
      email: createdUser.email,
      firstName: createdUser.firstName,
      lastName: createdUser.lastName,
      role: createdUser.role.name,
    },
  });
});

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  collegeId: z.string().min(3).optional(),
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']).optional(),
  isActive: z.boolean().optional(),
});

router.patch('/users/:id', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const id = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!id) return res.status(400).json({ message: 'User ID is required.' });

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid user payload.' });

  const targetUser = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!targetUser) return res.status(404).json({ message: 'User not found.' });

  const allowedRoles = req.user!.role === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']
    : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];

  if (!allowedRoles.includes(targetUser.role.name)) {
    return res.status(403).json({ message: 'You are not allowed to edit this role.' });
  }

  const { username, collegeId, email, firstName, lastName, role, isActive } = parsed.data;

  if (role && !allowedRoles.includes(role)) {
    return res.status(403).json({ message: 'You are not allowed to assign this role.' });
  }

  if (username || collegeId || email) {
    const conflict = await prisma.user.findFirst({
      where: {
        id: { not: id },
        OR: [username ? { username } : undefined, collegeId ? { collegeId } : undefined, email ? { email } : undefined].filter(Boolean) as any,
      },
    });
    if (conflict) return res.status(409).json({ message: 'Another user already has that username, email, or college ID.' });
  }

  let roleId = targetUser.roleId;
  if (role) {
    const roleRecord = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRecord) return res.status(400).json({ message: 'Invalid role selected.' });
    roleId = roleRecord.id;
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...(username ? { username } : {}),
      ...(collegeId ? { collegeId } : {}),
      ...(email ? { email } : {}),
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      roleId,
    },
    include: { role: true },
  });

  return res.json({
    message: 'User updated successfully.',
    user: {
      id: updatedUser.id, collegeId: updatedUser.collegeId, username: updatedUser.username,
      email: updatedUser.email, firstName: updatedUser.firstName, lastName: updatedUser.lastName,
      role: updatedUser.role.name, isActive: updatedUser.isActive,
    },
  });
});

router.delete('/users/:id', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const id = typeof rawId === 'string' ? rawId : rawId?.[0];

  if (!id) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    include: { role: true, studentProfile: true, teacherProfile: true },
  });

  if (!targetUser) {
    return res.status(404).json({ message: 'User not found.' });
  }

  if (targetUser.id === req.user!.userId) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }

  const allowedRoles = req.user!.role === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']
    : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];

  if (!allowedRoles.includes(targetUser.role.name)) {
    return res.status(403).json({ message: 'You are not allowed to delete this role.' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (targetUser.studentProfile) {
        await tx.receipt.deleteMany({ where: { studentId: targetUser.studentProfile.id } });
        await tx.payment.deleteMany({ where: { studentId: targetUser.studentProfile.id } });
        await tx.fee.deleteMany({ where: { studentId: targetUser.studentProfile.id } });
        await tx.attendance.deleteMany({ where: { studentId: targetUser.studentProfile.id } });
        await tx.mark.deleteMany({ where: { studentId: targetUser.studentProfile.id } });
        await tx.enrollment.deleteMany({ where: { studentId: targetUser.studentProfile.id } });
        await tx.correctionRequest.deleteMany({ where: { studentId: targetUser.studentProfile.id } });
        await tx.studentProfile.delete({ where: { id: targetUser.studentProfile.id } });
      }

      if (targetUser.teacherProfile) {
        await tx.subject.updateMany({
          where: { teacherId: targetUser.teacherProfile.id },
          data: { teacherId: null },
        });
        await tx.teacherProfile.delete({ where: { id: targetUser.teacherProfile.id } });
      }

      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.auditLog.deleteMany({ where: { userId: id } });
      await tx.payment.deleteMany({ where: { collectedByUserId: id } });
      await tx.correctionRequest.deleteMany({ where: { reviewerUserId: id } });

      await tx.user.delete({ where: { id } });
    });

    return res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return res.status(500).json({ message: 'Something went wrong while deleting this user.' });
  }
});

router.post('/change-password', protect, async (req: AuthRequest, res) => {
  const { oldPassword, newPassword } = req.body ?? {};
  if (!oldPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'Password update failed.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    return res.status(400).json({ message: 'Current password is incorrect.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return res.json({ message: 'Password updated successfully.' });
});

router.post('/logout', protect, async (_req, res) => {
  return res.json({ message: 'Logged out successfully.' });
});

export default router;
