-- Comments can be edited and deleted.
ALTER TABLE "Comment" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "Comment" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Reports about more than projects.
ALTER TYPE "NotificationType" ADD VALUE 'CONTENT_MODERATED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_MODERATED';

CREATE TYPE "ReportTarget" AS ENUM ('PROJECT', 'COMMENT', 'COLLECTION', 'USER', 'ORG_ACTIVITY');

ALTER TABLE "Report" ADD COLUMN "targetType" "ReportTarget" NOT NULL DEFAULT 'PROJECT';
ALTER TABLE "Report" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Report" ADD COLUMN "commentId" TEXT;
ALTER TABLE "Report" ADD COLUMN "collectionId" TEXT;
ALTER TABLE "Report" ADD COLUMN "activityId" TEXT;
ALTER TABLE "Report" ADD COLUMN "subjectUserId" TEXT;
ALTER TABLE "Report" ADD COLUMN "excerpt" TEXT;

-- Every existing report is about a project; its subject is the owner.
UPDATE "Report" r SET "subjectUserId" = p."ownerId" FROM "Project" p WHERE p."id" = r."projectId";

CREATE INDEX "Report_targetType_status_idx" ON "Report"("targetType", "status");

ALTER TABLE "Report" ADD CONSTRAINT "Report_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "OrgActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
