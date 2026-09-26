-- CreateEnum
CREATE TYPE "ReactionKind" AS ENUM ('USEFUL', 'IMPRESSIVE', 'WELL_DOCUMENTED', 'WOULD_USE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_LIKED';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_COMMENTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_FORKED';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_REACTED';
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOWED_YOU';
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOWING_PUBLISHED';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "key" TEXT;

-- CreateTable
CREATE TABLE "ProjectReaction" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectReaction_pkey" PRIMARY KEY ("projectId","userId","kind")
);

-- CreateIndex
CREATE INDEX "Project_publishedAt_idx" ON "Project"("publishedAt");

-- CreateIndex
CREATE INDEX "Project_ownerId_pinnedAt_idx" ON "Project"("ownerId", "pinnedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_type_key_idx" ON "Notification"("userId", "type", "key");

-- AddForeignKey
ALTER TABLE "ProjectReaction" ADD CONSTRAINT "ProjectReaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReaction" ADD CONSTRAINT "ProjectReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill publishedAt for everything that is already visible. Without this the
-- feed would be empty on the day this ships: every existing project would look
-- as though it had never been published, since publishedAt is only stamped by
-- the write paths added alongside this migration.
UPDATE "Project" SET "publishedAt" = "createdAt" WHERE "visibility" <> 'PRIVATE';
