-- AlterEnum
ALTER TYPE "ReportReason" ADD VALUE 'SEXUAL_CONTENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "evidenceKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
