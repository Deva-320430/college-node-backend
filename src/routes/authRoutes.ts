import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken } from '../utils/jwt';
import { protect, requireRole, type AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';

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
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT', 'ACCOUNTANT']),
  dob: z.string().min(8),
  joiningDate: z.string().min(8),
  yearsOfExperience: z.string().optional(),
  phoneNumber: z.string().min(10),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),  // NEW
  religion: z.string().optional(),                          // NEW
  maritalStatus: z.string().optional(),                     // NEW — Teacher/Exam Cell/Admin only
  partnerName: z.string().optional(),                       // NEW — when married
  partnerOccupation: z.string().optional(),                 // NEW — when married
  departmentId: z.string().optional(),                      // NEW — Teacher/Student only
  courseId: z.string().optional(),                          // NEW — Teacher/Student only
  regulationId: z.string().optional(),                      // NEW — Student only
  address: z.string(),      // NEW
  salary: z.string().optional(),       // NEW
  // NEW — Student only
  rollNumber: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  guardianName: z.string().optional(),
  fatherOccupation: z.string().optional(),
  motherOccupation: z.string().optional(),
  guardianOccupation: z.string().optional(),
  identificationMark1: z.string().optional(),
  identificationMark2: z.string().optional(),
  isRegular: z.string().optional(),      // NEW — Student: "true"/"false" or "Regular"/"Irregular"
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
      dob: user.dob,
      joiningDate: user.joiningDate,
      yearsOfExperience: user.yearsOfExperience,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      religion: user.religion,
      maritalStatus: user.maritalStatus,
      partnerName: user.partnerName,
      partnerOccupation: user.partnerOccupation,
      address: user.address,
      salary: user.salary,
    },
  });
});

router.get('/users', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const allowedRoles = req.user!.role === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT', 'ACCOUNTANT']
    : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];

  // after
  const users = await prisma.user.findMany({
    include: {
      role: true,
      teacherProfile: { include: { department: true, course: true } },
      studentProfile: { include: { department: true, course: true, regulation: true } },
    },
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
      phoneNumber: user.phoneNumber,
      dob: user.dob,
      joiningDate: user.joiningDate,
      profilePhoto: user.profilePhoto,
      documentUrls: user.documentUrls,
      address: user.address,
      gender: user.gender,
      religion: user.religion,
      maritalStatus: user.maritalStatus,
      partnerName: user.partnerName,
      partnerOccupation: user.partnerOccupation,
      salary: user.salary,
      yearsOfExperience: user.yearsOfExperience,
      rollNumber: user.studentProfile?.rollNumber ?? null,
      fatherName: user.studentProfile?.fatherName ?? null,
      motherName: user.studentProfile?.motherName ?? null,
      guardianName: user.studentProfile?.guardianName ?? null,
      fatherOccupation: user.studentProfile?.fatherOccupation ?? null,
      motherOccupation: user.studentProfile?.motherOccupation ?? null,
      guardianOccupation: user.studentProfile?.guardianOccupation ?? null,
      identificationMark1: user.studentProfile?.identificationMark1 ?? null,
      identificationMark2: user.studentProfile?.identificationMark2 ?? null,
      isRegular: user.studentProfile?.isRegular ?? null,
      department: user.teacherProfile?.department
        ? `${user.teacherProfile.department.code} — ${user.teacherProfile.department.name}`
        : user.studentProfile?.department
        ? `${user.studentProfile.department.code} — ${user.studentProfile.department.name}`
        : null,
      course: user.teacherProfile?.course
        ? `${user.teacherProfile.course.code} — ${user.teacherProfile.course.name}`
        : user.studentProfile?.course
        ? `${user.studentProfile.course.code} — ${user.studentProfile.course.name}`
        : null,
      regulation: user.studentProfile?.regulation ? user.studentProfile.regulation.name : null,
      departmentId: user.studentProfile?.departmentId ?? user.teacherProfile?.departmentId ?? null,
      courseId: user.studentProfile?.courseId ?? user.teacherProfile?.courseId ?? null,
      regulationId: user.studentProfile?.regulationId ?? null,
    })),
  });
});

router.post('/register', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'),upload.fields([{ name: 'profilePhoto', maxCount: 1 },{ name: 'documents', maxCount: 5 },]), async (req: AuthRequest, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'please fill the all fields.' });
  }

  const { username, collegeId, email, firstName, lastName, password, role, dob, joiningDate, yearsOfExperience, phoneNumber, gender, religion, maritalStatus, partnerName, partnerOccupation, departmentId, courseId, regulationId, address, salary, rollNumber, fatherName, motherName, guardianName, fatherOccupation, motherOccupation, guardianOccupation, identificationMark1, identificationMark2, isRegular } = parsed.data;
  const staffRoles = ['TEACHER', 'EXAM_CELL', 'ADMIN'];
  const allowedRoles = req.user!.role === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT', 'ACCOUNTANT']
    : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ message: 'You are not allowed to create this role.' });
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }],
    },
  });

  if (existingUser) {
    return res.status(409).json({ message: 'User with the same username or email already exists.' });
  }

  const roleRecord = await prisma.role.findUnique({ where: { name: role } });
  if (!roleRecord) {
    return res.status(400).json({ message: 'Invalid role selected.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // after
  const files = req.files as { profilePhoto?: Express.Multer.File[]; documents?: Express.Multer.File[] } | undefined;
  const profilePhotoPath = files?.profilePhoto?.[0] ? `/uploads/profile-photos/${files.profilePhoto[0].filename}` : null;
  const documentPaths = (files?.documents ?? []).map((f) => `/uploads/teacher-documents/${f.filename}`);

  // after
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
      phoneNumber: phoneNumber || null,
      dob: dob ? new Date(dob) : null,
      joiningDate: joiningDate ? new Date(joiningDate) : null,
      profilePhoto: profilePhotoPath,
      documentUrls: documentPaths,
      address: address || null,
      gender: gender || null,
      religion: religion || null,
      maritalStatus: staffRoles.includes(role) && maritalStatus ? maritalStatus : null,
      partnerName: staffRoles.includes(role) && partnerName ? partnerName : null,
      partnerOccupation: staffRoles.includes(role) && partnerOccupation ? partnerOccupation : null,
      salary: staffRoles.includes(role) && salary ? parseFloat(salary) : null,
      yearsOfExperience: staffRoles.includes(role) && yearsOfExperience ? parseInt(yearsOfExperience, 10) : null,
    },
    include: { role: true, },
  });

  if (role === 'TEACHER') {
    const departmentRecord = departmentId ? await prisma.department.findUnique({ where: { id: departmentId } }) : null;
    if (departmentId && !departmentRecord) {
      return res.status(400).json({ message: 'Selected department does not exist.' });
    }
    const courseRecord = courseId ? await prisma.course.findUnique({ where: { id: courseId } }) : null;
    if (courseId && !courseRecord) {
      return res.status(400).json({ message: 'Selected course does not exist.' });
    }

    await prisma.teacherProfile.create({
      data: {
        userId: createdUser.id,
        employeeId: `EMP-${crypto.randomUUID()}`,
        departmentId: departmentId || undefined,
        courseId: courseId || undefined,
      },
    });
  }

  if (role === 'STUDENT') {
    if (rollNumber) {
      const existingRoll = await prisma.studentProfile.findUnique({ where: { rollNumber } });
      if (existingRoll) {
        return res.status(409).json({ message: 'A student with that roll number already exists.' });
      }
    }

    const departmentRecord = departmentId ? await prisma.department.findUnique({ where: { id: departmentId } }) : null;
    if (departmentId && !departmentRecord) {
      return res.status(400).json({ message: 'Selected department does not exist.' });
    }
    const courseRecord = courseId ? await prisma.course.findUnique({ where: { id: courseId } }) : null;
    if (courseId && !courseRecord) {
      return res.status(400).json({ message: 'Selected course does not exist.' });
    }
    const regulationRecord = regulationId ? await prisma.regulation.findUnique({ where: { id: regulationId } }) : null;
    if (regulationId && !regulationRecord) {
      return res.status(400).json({ message: 'Selected regulation does not exist.' });
    }

    await prisma.studentProfile.create({
      data: {
        userId: createdUser.id,
        studentId: `STU-${crypto.randomUUID()}`,
        registrationNumber: `REG-${crypto.randomUUID()}`,
        rollNumber: rollNumber || `R-${crypto.randomUUID()}`,
        departmentId: departmentId || undefined,
        courseId: courseId || undefined,
        regulationId: regulationId || undefined,
        fatherName: fatherName || undefined,
        motherName: motherName || undefined,
        guardianName: guardianName || undefined,
        fatherOccupation: fatherOccupation || undefined,
        motherOccupation: motherOccupation || undefined,
        guardianOccupation: guardianOccupation || undefined,
        identificationMark1: identificationMark1 || undefined,
        identificationMark2: identificationMark2 || undefined,
        isRegular: isRegular === undefined ? undefined : isRegular === 'true' || isRegular === 'Regular',
      },
    });
  }

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
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT', 'ACCOUNTANT']).optional(),
  isActive: z.boolean().optional(),
  dob: z.string().min(8).optional(),
  joiningDate: z.string().min(8).optional(),
  yearsOfExperience: z.string().optional(),
  phoneNumber: z.string().min(10).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),  // NEW
  religion: z.string().optional(),                          // NEW
  maritalStatus: z.string().optional(),                     // NEW
  partnerName: z.string().optional(),                       // NEW
  partnerOccupation: z.string().optional(),                 // NEW
  address: z.string().optional(),      // NEW
  salary: z.string().optional(),       // NEW
  departmentId: z.string().optional(), // Teacher/Student
  courseId: z.string().optional(),     // Teacher/Student
  regulationId: z.string().optional(), // Student
  // NEW — Student only
  rollNumber: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  guardianName: z.string().optional(),
  fatherOccupation: z.string().optional(),
  motherOccupation: z.string().optional(),
  guardianOccupation: z.string().optional(),
  identificationMark1: z.string().optional(),
  identificationMark2: z.string().optional(),
  isRegular: z.string().optional(), // "Regular"/"Irregular"/"true"/"false"
});

router.patch('/users/:id', protect, requireRole('SUPER_ADMIN', 'CHAIRMAN'), async (req: AuthRequest, res) => {
  const rawId = req.params.id;
  const id = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!id) return res.status(400).json({ message: 'User ID is required.' });

  // Strip empty strings so optional Zod fields with min() constraints aren't rejected
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
    cleaned[k] = typeof v === 'string' && v.trim() === '' ? undefined : v;
  }

  const parsed = updateUserSchema.safeParse(cleaned);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid user payload.' });

  const targetUser = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!targetUser) return res.status(404).json({ message: 'User not found.' });

  const allowedRoles = req.user!.role === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT', 'ACCOUNTANT']
    : ['ADMIN', 'EXAM_CELL', 'TEACHER', 'STUDENT'];

  if (!allowedRoles.includes(targetUser.role.name)) {
    return res.status(403).json({ message: 'You are not allowed to edit this role.' });
  }

  const { username, collegeId, email, firstName, lastName, role, isActive, dob, joiningDate, yearsOfExperience, phoneNumber, gender, religion, maritalStatus, partnerName, partnerOccupation, address, salary, departmentId, courseId, regulationId, rollNumber, fatherName, motherName, guardianName, fatherOccupation, motherOccupation, guardianOccupation, identificationMark1, identificationMark2, isRegular } = parsed.data;
  if (role && !allowedRoles.includes(role)) {
    return res.status(403).json({ message: 'You are not allowed to assign this role.' });
  }

  if (username || email) {
    const conflict = await prisma.user.findFirst({
      where: {
        id: { not: id },
        OR: [username ? { username } : undefined, email ? { email } : undefined].filter(Boolean) as any,
      },
    });
    if (conflict) return res.status(409).json({ message: 'Another user already has that username or email.' });
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
      ...(dob ? { dob: new Date(dob) } : {}),
      ...(joiningDate ? { joiningDate: new Date(joiningDate) } : {}),
      ...(yearsOfExperience ? { yearsOfExperience: parseInt(yearsOfExperience, 10) } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(address ? { address } : {}),
      ...(gender ? { gender } : {}),
      ...(religion ? { religion } : {}),
      ...(maritalStatus ? { maritalStatus } : {}),
      ...(partnerName ? { partnerName } : {}),
      ...(partnerOccupation ? { partnerOccupation } : {}),
      ...(salary ? { salary: parseFloat(salary) } : {}),
      roleId,
    },
    include: { role: true },
  });

  const targetRole = role ?? targetUser.role.name;

  /* Teacher: department + course live on the TeacherProfile */
  if (targetRole === 'TEACHER' && (departmentId || courseId)) {
    if (departmentId && !(await prisma.department.findUnique({ where: { id: departmentId } }))) {
      return res.status(400).json({ message: 'Selected department does not exist.' });
    }
    if (courseId && !(await prisma.course.findUnique({ where: { id: courseId } }))) {
      return res.status(400).json({ message: 'Selected course does not exist.' });
    }
    await prisma.teacherProfile.upsert({
      where: { userId: id },
      update: {
        ...(departmentId ? { departmentId } : {}),
        ...(courseId ? { courseId } : {}),
      },
      create: {
        userId: id,
        employeeId: `EMP-${crypto.randomUUID()}`,
        ...(departmentId ? { departmentId } : {}),
        ...(courseId ? { courseId } : {}),
      },
    });
  }

  /* Student: all student-specific fields live on the StudentProfile */
  if (
    targetRole === 'STUDENT' &&
    (departmentId || courseId || regulationId || rollNumber || fatherName || motherName || guardianName ||
      fatherOccupation || motherOccupation || guardianOccupation || identificationMark1 || identificationMark2 || isRegular)
  ) {
    if (departmentId && !(await prisma.department.findUnique({ where: { id: departmentId } }))) {
      return res.status(400).json({ message: 'Selected department does not exist.' });
    }
    if (courseId && !(await prisma.course.findUnique({ where: { id: courseId } }))) {
      return res.status(400).json({ message: 'Selected course does not exist.' });
    }
    if (regulationId && !(await prisma.regulation.findUnique({ where: { id: regulationId } }))) {
      return res.status(400).json({ message: 'Selected regulation does not exist.' });
    }
    if (rollNumber) {
      const existingRoll = await prisma.studentProfile.findUnique({ where: { rollNumber } });
      if (existingRoll && existingRoll.userId !== id) {
        return res.status(409).json({ message: 'A student with that roll number already exists.' });
      }
    }

    await prisma.studentProfile.upsert({
      where: { userId: id },
      update: {
        ...(departmentId ? { departmentId } : {}),
        ...(courseId ? { courseId } : {}),
        ...(regulationId ? { regulationId } : {}),
        ...(rollNumber ? { rollNumber } : {}),
        ...(fatherName ? { fatherName } : {}),
        ...(motherName ? { motherName } : {}),
        ...(guardianName ? { guardianName } : {}),
        ...(fatherOccupation ? { fatherOccupation } : {}),
        ...(motherOccupation ? { motherOccupation } : {}),
        ...(guardianOccupation ? { guardianOccupation } : {}),
        ...(identificationMark1 ? { identificationMark1 } : {}),
        ...(identificationMark2 ? { identificationMark2 } : {}),
        ...(isRegular !== undefined && isRegular !== '' ? { isRegular: isRegular === 'true' || isRegular === 'Regular' } : {}),
      },
      create: {
        userId: id,
        studentId: `STU-${crypto.randomUUID()}`,
        registrationNumber: `REG-${crypto.randomUUID()}`,
        rollNumber: rollNumber || `R-${crypto.randomUUID()}`,
        departmentId: departmentId || undefined,
        courseId: courseId || undefined,
        regulationId: regulationId || undefined,
        fatherName: fatherName || undefined,
        motherName: motherName || undefined,
        guardianName: guardianName || undefined,
        fatherOccupation: fatherOccupation || undefined,
        motherOccupation: motherOccupation || undefined,
        guardianOccupation: guardianOccupation || undefined,
        identificationMark1: identificationMark1 || undefined,
        identificationMark2: identificationMark2 || undefined,
        ...(isRegular !== undefined && isRegular !== '' ? { isRegular: isRegular === 'true' || isRegular === 'Regular' } : {}),
      },
    });
  }

  return res.json({
    message: 'User updated successfully.',
    user: {
      id: updatedUser.id, collegeId: updatedUser.collegeId, username: updatedUser.username,
      email: updatedUser.email, firstName: updatedUser.firstName, lastName: updatedUser.lastName,
      role: updatedUser.role.name, isActive: updatedUser.isActive, dob: updatedUser.dob, joiningDate: updatedUser.joiningDate, 
      yearsOfExperience: updatedUser.yearsOfExperience, phoneNumber: updatedUser.phoneNumber, gender: updatedUser.gender, religion: updatedUser.religion, maritalStatus: updatedUser.maritalStatus, partnerName: updatedUser.partnerName, partnerOccupation: updatedUser.partnerOccupation, address: updatedUser.address, salary: updatedUser.salary,
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
    ? ['SUPER_ADMIN', 'ADMIN', 'CHAIRMAN', 'EXAM_CELL', 'TEACHER', 'STUDENT', 'ACCOUNTANT']
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
