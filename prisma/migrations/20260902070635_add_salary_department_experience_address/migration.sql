-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_departmentId_fkey";

-- DropIndex
DROP INDEX "Subject_code_key";

-- DropIndex
DROP INDEX "User_collegeId_key";

-- AlterTable
ALTER TABLE "Course" DROP COLUMN "departmentId";

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "fatherOccupation" TEXT,
ADD COLUMN     "guardianOccupation" TEXT,
ADD COLUMN     "identificationMark1" TEXT,
ADD COLUMN     "identificationMark2" TEXT,
ADD COLUMN     "isRegular" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "motherOccupation" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "departmentId" TEXT NOT NULL,
ADD COLUMN     "regulationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TeacherProfile" DROP COLUMN "yearsOfExperience",
ADD COLUMN     "courseId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "partnerName" TEXT,
ADD COLUMN     "partnerOccupation" TEXT,
ADD COLUMN     "religion" TEXT,
ADD COLUMN     "salary" DOUBLE PRECISION,
ADD COLUMN     "yearsOfExperience" INTEGER;

-- CreateTable
CREATE TABLE "Regulation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Regulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CourseToDepartment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Regulation_name_key" ON "Regulation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_CourseToDepartment_AB_unique" ON "_CourseToDepartment"("A", "B");

-- CreateIndex
CREATE INDEX "_CourseToDepartment_B_index" ON "_CourseToDepartment"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_code_regulationId_departmentId_key" ON "Subject"("code", "regulationId", "departmentId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseToDepartment" ADD CONSTRAINT "_CourseToDepartment_A_fkey" FOREIGN KEY ("A") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseToDepartment" ADD CONSTRAINT "_CourseToDepartment_B_fkey" FOREIGN KEY ("B") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

