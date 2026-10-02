-- CreateEnum
CREATE TYPE "ScanTarget" AS ENUM ('AVATAR', 'PROJECT_FILE', 'THUMBNAIL', 'ORG_ACTIVITY');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'FLAGGED', 'SKIPPED', 'CLEARED');

-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "reporterId" DROP NOT NULL,
ADD COLUMN "scanKey" TEXT;

-- CreateTable
CREATE TABLE "ImageScan" (
    "key" TEXT NOT NULL,
    "target" "ScanTarget" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "labels" JSONB,
    "undo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedAt" TIMESTAMP(3),

    CONSTRAINT "ImageScan_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ImageScan_status_createdAt_idx" ON "ImageScan"("status", "createdAt");
