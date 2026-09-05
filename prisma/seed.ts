import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import process from 'process';

const prisma = new PrismaClient();

async function main() {
  // Infrastructure: roles are required by the app's role-based auth.
  const roles = Object.values(UserRole);
  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `Role: ${roleName}` },
    });
  }

  // Bootstrap account only. Everything else (departments, courses, students,
  // teachers, semesters, academic years, other users) is meant to be created
  // by an admin through the website, not hardcoded here.
  const adminRole = await prisma.role.findUnique({ where: { name: UserRole.SUPER_ADMIN } });
  if (!adminRole) {
    throw new Error('Mandatory roles missing');
  }

  const passwordHash = await bcrypt.hash('Password@123', 10);

  await prisma.user.upsert({
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