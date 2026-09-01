import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import process from 'process';

const prisma = new PrismaClient();

async function main() {
  const roles = Object.values(UserRole);
  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `Role: ${roleName}` },
    });
  }

  const adminRole = await prisma.role.findUnique({ where: { name: UserRole.SUPER_ADMIN } });
  const adminRole2 = await prisma.role.findUnique({ where: { name: UserRole.ADMIN } });
  const chairmanRole = await prisma.role.findUnique({ where: { name: UserRole.CHAIRMAN } });
  const examRole = await prisma.role.findUnique({ where: { name: UserRole.EXAM_CELL } });
  const teacherRole = await prisma.role.findUnique({ where: { name: UserRole.TEACHER } });
  const studentRole = await prisma.role.findUnique({ where: { name: UserRole.STUDENT } });

  if (!adminRole || !adminRole2 || !chairmanRole || !examRole || !teacherRole || !studentRole) {
    throw new Error('Mandatory roles missing');
  }

  const passwordHash = await bcrypt.hash('Password@123', 10);

  const superAdmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      collegeId: 'COL-1000',
      email: 'superadmin@college.edu',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      roleId: adminRole.id,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'admin1' },
    update: {},
    create: {
      username: 'admin1',
      collegeId: 'COL-1001',
      email: 'admin1@college.edu',
      passwordHash,
      firstName: 'Admin',
      lastName: 'One',
      roleId: adminRole2.id,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'chairman' },
    update: {},
    create: {
      username: 'chairman',
      collegeId: 'COL-2001',
      email: 'chairman@college.edu',
      passwordHash,
      firstName: 'Chair',
      lastName: 'Person',
      roleId: chairmanRole.id,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'examcell' },
    update: {},
    create: {
      username: 'examcell',
      collegeId: 'COL-3001',
      email: 'examcell@college.edu',
      passwordHash,
      firstName: 'Exam',
      lastName: 'Cell',
      roleId: examRole.id,
      isActive: true,
    },
  });

  const departments = ['Computer Science', 'Electronics', 'Mechanical', 'Business Administration'];
  for (const dept of departments) {
    await prisma.department.upsert({
      where: { name: dept },
      update: {},
      create: { name: dept, code: dept.slice(0, 3).toUpperCase() },
    });
  }

  const csDept = await prisma.department.findUnique({ where: { name: 'Computer Science' } });
  const course = await prisma.course.upsert({
    where: { code: 'BCA' },
    update: {},
    create: {
      code: 'BCA',
      name: 'Bachelor of Computer Applications',
      duration: 3,
      departmentId: csDept!.id,
    },
  });

  const semester = await prisma.semester.upsert({
    where: { code: 'SEM1' },
    update: {},
    create: { code: 'SEM1', name: 'Semester 1' },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { name: '2026-27' },
    update: {},
    create: {
      name: '2026-27',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
    },
  });

  const studentUser = await prisma.user.upsert({
    where: { username: 'student1' },
    update: {},
    create: {
      username: 'student1',
      collegeId: 'STU-1001',
      email: 'student1@college.edu',
      passwordHash,
      firstName: 'Student',
      lastName: 'One',
      roleId: studentRole.id,
      isActive: true,
    },
  });

  await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      studentId: 'STU-1001',
      rollNumber: 'CS-101',
      registrationNumber: 'REG-2026001',
      departmentId: csDept!.id,
      courseId: course.id,
      currentSemesterId: semester.id,
      academicYearId: academicYear.id,
      phoneNumber: '+91 9876543210',
      address: 'Campus Avenue',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      fatherName: 'Father One',
      motherName: 'Mother One',
      guardianName: 'Guardian One',
      parentPhone: '+91 9988776655',
      parentEmail: 'parent@college.edu',
      parentOccupation: 'Engineer',
      batch: '2026',
      admissionYear: 2026,
      section: 'A',
      universityRegistration: 'UNI-REG-001',
    },
  });

  const teacherUser = await prisma.user.upsert({
    where: { username: 'teacher1' },
    update: {},
    create: {
      username: 'teacher1',
      collegeId: 'FAC-1001',
      email: 'teacher1@college.edu',
      passwordHash,
      firstName: 'Teacher',
      lastName: 'One',
      roleId: teacherRole.id,
      isActive: true,
    },
  });

  const teacherProfile = await prisma.teacherProfile.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      userId: teacherUser.id,
      employeeId: 'FAC-1001',
      departmentId: csDept!.id,
      designation: 'Assistant Professor',
      phoneNumber: '+91 9123456780',
      address: 'Faculty Block',
    },
  });

  await prisma.subject.upsert({
    where: { code: 'MATH101' },
    update: {},
    create: {
      code: 'MATH101',
      name: 'Mathematics',
      credits: 4,
      courseId: course.id,
      teacherId: teacherProfile.id,
    },
  });

  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
