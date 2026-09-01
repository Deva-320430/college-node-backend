"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../utils/jwt");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    collegeId: zod_1.z.string().min(3),
    password: zod_1.z.string().min(6),
});
const registerSchema = zod_1.z.object({
    username: zod_1.z.string().min(3),
    collegeId: zod_1.z.string().min(3),
    email: zod_1.z.string().email(),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    password: zod_1.z.string().min(6),
    role: zod_1.z.enum(['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']),
});
router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid login payload.' });
    }
    const { collegeId, password } = parsed.data;
    const user = await prisma_1.prisma.user.findFirst({
        where: {
            OR: [{ collegeId }, { username: collegeId }, { email: collegeId }],
        },
        include: { role: true },
    });
    if (!user || !user.isActive) {
        return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const validPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!validPassword) {
        return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const token = (0, jwt_1.signToken)({
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
router.get('/users', auth_1.protect, (0, auth_1.requireRole)('SUPER_ADMIN', 'CHAIRMAN'), async (req, res) => {
    const allowedRoles = req.user.role === 'SUPER_ADMIN'
        ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']
        : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];
    const users = await prisma_1.prisma.user.findMany({
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
router.post('/register', auth_1.protect, (0, auth_1.requireRole)('SUPER_ADMIN', 'CHAIRMAN'), async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid user payload.' });
    }
    const { username, collegeId, email, firstName, lastName, password, role } = parsed.data;
    const allowedRoles = req.user.role === 'SUPER_ADMIN'
        ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']
        : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];
    if (!allowedRoles.includes(role)) {
        return res.status(403).json({ message: 'You are not allowed to create this role.' });
    }
    const existingUser = await prisma_1.prisma.user.findFirst({
        where: {
            OR: [{ username }, { collegeId }, { email }],
        },
    });
    if (existingUser) {
        return res.status(409).json({ message: 'User with the same username, email, or college ID already exists.' });
    }
    const roleRecord = await prisma_1.prisma.role.findUnique({ where: { name: role } });
    if (!roleRecord) {
        return res.status(400).json({ message: 'Invalid role selected.' });
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const createdUser = await prisma_1.prisma.user.create({
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
router.delete('/users/:id', auth_1.protect, (0, auth_1.requireRole)('SUPER_ADMIN', 'CHAIRMAN'), async (req, res) => {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : rawId?.[0];
    if (!id) {
        return res.status(400).json({ message: 'User ID is required.' });
    }
    const targetUser = await prisma_1.prisma.user.findUnique({
        where: { id },
        include: { role: true, studentProfile: true, teacherProfile: true },
    });
    if (!targetUser) {
        return res.status(404).json({ message: 'User not found.' });
    }
    if (targetUser.id === req.user.userId) {
        return res.status(400).json({ message: 'You cannot delete your own account.' });
    }
    const allowedRoles = req.user.role === 'SUPER_ADMIN'
        ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT']
        : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];
    if (!allowedRoles.includes(targetUser.role.name)) {
        return res.status(403).json({ message: 'You are not allowed to delete this role.' });
    }
    try {
        await prisma_1.prisma.$transaction(async (tx) => {
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
    }
    catch (error) {
        console.error('Failed to delete user:', error);
        return res.status(500).json({ message: 'Something went wrong while deleting this user.' });
    }
});
router.post('/change-password', auth_1.protect, async (req, res) => {
    const { oldPassword, newPassword } = req.body ?? {};
    if (!oldPassword || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: 'Password update failed.' });
    }
    const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) {
        return res.status(404).json({ message: 'User not found.' });
    }
    const valid = await bcryptjs_1.default.compare(oldPassword, user.passwordHash);
    if (!valid) {
        return res.status(400).json({ message: 'Current password is incorrect.' });
    }
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
    });
    return res.json({ message: 'Password updated successfully.' });
});
router.post('/logout', auth_1.protect, async (_req, res) => {
    return res.json({ message: 'Logged out successfully.' });
});
exports.default = router;
