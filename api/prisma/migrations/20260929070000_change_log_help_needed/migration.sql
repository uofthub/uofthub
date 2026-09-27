-- Edits now record what they changed on the Updates timeline, and a project
-- looking for help can say what with.
ALTER TABLE "Project" ADD COLUMN "helpNeeded" TEXT;

ALTER TABLE "ProjectVersion" ADD COLUMN "changes" JSONB,
ADD COLUMN "authorId" TEXT;

ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
