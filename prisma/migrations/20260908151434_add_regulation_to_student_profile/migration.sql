-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "regulationId" TEXT;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
