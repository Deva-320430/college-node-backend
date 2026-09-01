"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const updateStudentSchema = zod_1.z.object({
    phoneNumber: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
});
router.get('/me', auth_1.protect, async (req, res) => {
    const student = await prisma_1.prisma.studentProfile.findUnique({
        where: { userId: req.user.userId },
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
router.get('/:id', auth_1.protect, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = req.user;
    if (user.role !== 'STUDENT' || user.userId !== id) {
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'CHAIRMAN') {
            return res.status(403).json({ message: 'You do not have permission to view this profile.' });
        }
    }
    const student = await prisma_1.prisma.studentProfile.findUnique({
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
router.put('/:id', auth_1.protect, (0, auth_1.requireRole)('ADMIN', 'SUPER_ADMIN', 'STUDENT'), async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsed = updateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid student update payload.' });
    }
    const user = req.user;
    if (user.role === 'STUDENT' && user.userId !== id) {
        return res.status(403).json({ message: 'Students can only update their own record.' });
    }
    const student = await prisma_1.prisma.studentProfile.findUnique({ where: { id } });
    if (!student) {
        return res.status(404).json({ message: 'Student not found.' });
    }
    const updated = await prisma_1.prisma.studentProfile.update({
        where: { id },
        data: parsed.data,
    });
    return res.json(updated);
});
router.get('/:id/results', auth_1.protect, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const student = await prisma_1.prisma.studentProfile.findUnique({ where: { id } });
    if (!student) {
        return res.status(404).json({ message: 'Student not found.' });
    }
    const marks = await prisma_1.prisma.mark.findMany({
        where: { studentId: student.id },
        include: { subject: true, semester: true },
    });
    return res.json(marks);
});
router.get('/:id/attendance', auth_1.protect, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const student = await prisma_1.prisma.studentProfile.findUnique({ where: { id } });
    if (!student) {
        return res.status(404).json({ message: 'Student not found.' });
    }
    const attendance = await prisma_1.prisma.attendance.findMany({
        where: { studentId: student.id },
        include: { subject: true },
    });
    return res.json(attendance);
});
exports.default = router;
