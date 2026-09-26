-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING_VERIFICATION', 'IN_REVIEW', 'INFO_REQUESTED', 'VERIFIED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactRole" TEXT,
ADD COLUMN     "discordUrl" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "status" "OrgStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
ADD COLUMN     "verificationDeadline" TIMESTAMP(3),
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- Every group that already exists was created under the old rule, where
-- POST /orgs published immediately with no verification step. Retroactively
-- hiding them behind a deadline they never had a chance to meet — and then
-- letting the sweep delete them — would be wrong, so they are grandfathered
-- in as VERIFIED.
UPDATE "Organization" SET "status" = 'VERIFIED', "verifiedAt" = "createdAt";

-- AlterTable
ALTER TABLE "ProjectFile" ADD COLUMN     "orgId" TEXT;

-- CreateTable
CREATE TABLE "OrgStorageGrant" (
    "orgId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgStorageGrant_pkey" PRIMARY KEY ("orgId","term")
);

-- CreateTable
CREATE TABLE "OrgActivity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "link" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgActivity_orgId_date_idx" ON "OrgActivity"("orgId", "date");

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgStorageGrant" ADD CONSTRAINT "OrgStorageGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgActivity" ADD CONSTRAINT "OrgActivity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgActivity" ADD CONSTRAINT "OrgActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
