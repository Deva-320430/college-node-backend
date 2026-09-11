import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { protect, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();

const staffRoles = ['SUPER_ADMIN', 'CHAIRMAN', 'TEACHER'];

/* When a TEACHER calls an endpoint, resolve their department (from TeacherProfile)
   so they can only see / modify attendance for their own department.          */
const getTeacherDepartmentId = async (userId: string) => {
  const teacher = await prisma.teacherProfile.findUnique({ where: { userId } });
  return teacher?.departmentId ?? null;
};

/* Does the given subject belong to the teacher's own department? */
const teacherCanAccessSubject = async (userId: string, subjectId: string) => {
  const deptId = await getTeacherDepartmentId(userId);
  if (!deptId) return false;
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  return !!subject && subject.departmentId === deptId;
};

/* ------------------------------------------------------------------ */
/* GET / — attendance records for a date + subject                     */
/* ------------------------------------------------------------------ */

router.get('/', protect, requireRole(...staffRoles), async (req: AuthRequest, res) => {
  const { date, subjectId } = req.query;

  if (!date || !subjectId) {
    return res.status(400).json({ message: 'date and subjectId query params are required.' });
  }

  // Teachers can only read attendance for subjects in their own department
  if (
    req.user!.role === 'TEACHER' &&
    !(await teacherCanAccessSubject(req.user!.userId, subjectId as string))
  ) {
    return res.status(403).json({ message: 'You can only access subjects in your own department.' });
  }

  const targetDate = new Date(date as string);
  if (isNaN(targetDate.getTime())) {
    return res.status(400).json({ message: 'Invalid date.' });
  }

  // Start/end of the day in UTC
  const start = new Date(targetDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setUTCHours(23, 59, 59, 999);

  const records = await prisma.attendance.findMany({
    where: {
      subjectId: subjectId as string,
      date: { gte: start, lte: end },
    },
    include: {
      student: {
        select: {
          id: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true, collegeId: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return res.json({
    records: records.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      rollNumber: r.student.rollNumber,
      name: `${r.student.user.firstName} ${r.student.user.lastName}`.trim(),
      collegeId: r.student.user.collegeId,
      present: r.present,
    })),
  });
});

/* ------------------------------------------------------------------ */
/* GET /dates — dates that have attendance for a subject (calendar dots)*/
/* ------------------------------------------------------------------ */

router.get('/dates', protect, requireRole(...staffRoles), async (req: AuthRequest, res) => {
  const { subjectId, month, year } = req.query;

  if (!subjectId || !month || !year) {
    return res.status(400).json({ message: 'subjectId, month, and year query params are required.' });
  }

  const m = parseInt(month as string, 10);
  const y = parseInt(year as string, 10);
  if (isNaN(m) || isNaN(y) || m < 1 || m > 12) {
    return res.status(400).json({ message: 'Invalid month or year.' });
  }

  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const records = await prisma.attendance.findMany({
    where: {
      subjectId: subjectId as string,
      date: { gte: start, lte: end },
    },
    select: { date: true },
  });

  // Deduplicate to just unique day numbers
  const days = [...new Set(records.map((r) => new Date(r.date).getUTCDate()))];

  return res.json({ days });
});

/* ------------------------------------------------------------------ */
/* GET /regulations — regulations for the attendance regulation filter */
/* (kept separate from syllabus routes so TEACHERs can read them)       */
/* ------------------------------------------------------------------ */

router.get('/regulations', protect, requireRole(...staffRoles), async (_req: AuthRequest, res) => {
  const regulations = await prisma.regulation.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return res.json({ regulations });
});

/* ------------------------------------------------------------------ */
/* GET /subjects — all subjects for the attendance dropdown            */
/* ------------------------------------------------------------------ */

router.get('/subjects', protect, requireRole(...staffRoles), async (req: AuthRequest, res) => {
  const { regulationId } = req.query;
  // Teachers only see subjects in their own department (none if no department assigned)
  const deptId = req.user!.role === 'TEACHER' ? await getTeacherDepartmentId(req.user!.userId) : null;

  const subjects = await prisma.subject.findMany({
    where: {
      ...(req.user!.role === 'TEACHER' ? { departmentId: deptId ?? '__NO_DEPT__' } : {}),
      ...(regulationId ? { regulationId: regulationId as string } : {}),
    },
    include: {
      department: { select: { id: true, code: true, name: true } },
      regulation: { select: { id: true, name: true } },
    },
    orderBy: { code: 'asc' },
  });

  return res.json({ subjects });
});

/* ------------------------------------------------------------------ */
/* GET /students — students for a subject (by subject's department)    */
/* ------------------------------------------------------------------ */

router.get('/students', protect, requireRole(...staffRoles), async (req: AuthRequest, res) => {
  const { subjectId } = req.query;

  if (!subjectId) {
    return res.status(400).json({ message: 'subjectId query param is required.' });
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId as string } });
  if (!subject) return res.status(404).json({ message: 'Subject not found.' });

  // Teachers can only access students in their own department
  if (req.user!.role === 'TEACHER') {
    const deptId = await getTeacherDepartmentId(req.user!.userId);
    if (!deptId || subject.departmentId !== deptId) {
      return res.status(403).json({ message: 'You can only access subjects in your own department.' });
    }
  }

  const students = await prisma.studentProfile.findMany({
    where: subject.departmentId ? { departmentId: subject.departmentId } : {},
    include: {
      user: { select: { firstName: true, lastName: true, collegeId: true } },
      department: { select: { code: true, name: true } },
    },
    orderBy: { rollNumber: 'asc' },
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
    semesterId: null,
  });
});

/* ------------------------------------------------------------------ */
/* POST / — save attendance records (bulk upsert)                      */
/* ------------------------------------------------------------------ */

const saveAttendanceSchema = z.object({
  date: z.string().min(1, 'Date is required.'),
  subjectId: z.string().min(1, 'Subject is required.'),
  records: z.array(
    z.object({
      studentId: z.string(),
      present: z.boolean(),
    }),
  ).min(1, 'At least one student record is required.'),
});

router.post('/', protect, requireRole(...staffRoles), async (req: AuthRequest, res) => {
  const parsed = saveAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid attendance payload.' });
  }

  const { date, subjectId, records } = parsed.data;

  // Teachers can only save attendance for subjects in their own department
  if (req.user!.role === 'TEACHER' && !(await teacherCanAccessSubject(req.user!.userId, subjectId))) {
    return res.status(403).json({ message: 'You can only access subjects in your own department.' });
  }

  // Validate subject exists and resolve its semester
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) return res.status(404).json({ message: 'Subject not found.' });

  // Subject.semester is a string like "1 SEM" — find or create the matching Semester record
  const semName = subject.semester || 'Default';
  let semester = await prisma.semester.findFirst({ where: { name: semName } });
  if (!semester) {
    semester = await prisma.semester.create({
      data: { name: semName, code: semName.replace(/\s+/g, '-').toUpperCase() },
    });
  }
  const semesterId = semester.id;

  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    return res.status(400).json({ message: 'Invalid date.' });
  }
  const start = new Date(targetDate);
  start.setUTCHours(0, 0, 0, 0);

  const recordedBy = req.user!.userId;

  // Delete existing records for this date+subject, then create fresh ones
  await prisma.$transaction(async (tx) => {
    // Delete existing records for this date + subject
    await tx.attendance.deleteMany({
      where: {
        subjectId,
        date: { gte: start, lte: new Date(start.getTime() + 86400000 - 1) },
      },
    });

    // Create all new records
    await tx.attendance.createMany({
      data: records.map((rec) => ({
        studentId: rec.studentId,
        subjectId,
        semesterId,
        date: start,
        present: rec.present,
        recordedBy,
      })),
    });
  });

  return res.json({ message: 'Attendance saved successfully.' });
});

/* ------------------------------------------------------------------ */
/* DELETE / — clear attendance records for a date + subject             */
/* ------------------------------------------------------------------ */

router.delete('/', protect, requireRole(...staffRoles), async (req: AuthRequest, res) => {
  const { date, subjectId } = req.body;

  if (!date || !subjectId) {
    return res.status(400).json({ message: 'date and subjectId are required.' });
  }

  // Teachers can only clear attendance for subjects in their own department
  if (
    req.user!.role === 'TEACHER' &&
    !(await teacherCanAccessSubject(req.user!.userId, subjectId as string))
  ) {
    return res.status(403).json({ message: 'You can only access subjects in your own department.' });
  }

  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    return res.status(400).json({ message: 'Invalid date.' });
  }
  const start = new Date(targetDate);
  start.setUTCHours(0, 0, 0, 0);

  const result = await prisma.attendance.deleteMany({
    where: {
      subjectId,
      date: { gte: start, lte: new Date(start.getTime() + 86400000 - 1) },
    },
  });

  return res.json({ message: `Attendance cleared. ${result.count} record(s) removed.` });
});

export default router;
