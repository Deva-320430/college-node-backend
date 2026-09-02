/*
  Warnings:

  - You are about to drop the column `dob` on the `TeacherProfile` table. All the data in the column will be lost.
  - You are about to drop the column `documentUrls` on the `TeacherProfile` table. All the data in the column will be lost.
  - You are about to drop the column `joiningDate` on the `TeacherProfile` table. All the data in the column will be lost.
  - You are about to drop the column `phoneNumber` on the `TeacherProfile` table. All the data in the column will be lost.
  - You are about to drop the column `profilePhoto` on the `TeacherProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TeacherProfile" DROP COLUMN "dob",
DROP COLUMN "documentUrls",
DROP COLUMN "joiningDate",
DROP COLUMN "phoneNumber",
DROP COLUMN "profilePhoto";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "documentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "joiningDate" TIMESTAMP(3),
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "profilePhoto" TEXT;
