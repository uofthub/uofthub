-- Fork is removed. Remixing, if it comes back, will be opt-in by the owner and
-- carry permanent attribution — see docs/not-decided-yet.md.

-- A notification can't keep a type the enum no longer has.
DELETE FROM "Notification" WHERE "type" = 'PROJECT_FORKED';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('COLLABORATOR_INVITED', 'COLLABORATOR_RESPONDED', 'ACCESS_REQUESTED', 'ACCESS_REQUEST_DECIDED', 'PROJECT_MODERATED', 'PROJECT_LIKED', 'PROJECT_COMMENTED', 'PROJECT_REACTED', 'FOLLOWED_YOU', 'FOLLOWING_PUBLISHED', 'PROJECT_COLLAB_INTEREST', 'COMMENT_REPLIED', 'MESSAGING_MODERATED', 'PROJECT_UPDATED', 'CONTENT_MODERATED', 'ACCOUNT_MODERATED', 'ORG_INVITED', 'ORG_JOIN_REQUESTED', 'ORG_MEMBERSHIP_DECIDED');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- Existing forks stay as ordinary projects owned by whoever forked them; only
-- the link back to the original goes.
ALTER TABLE "Project" DROP CONSTRAINT "Project_forkedFromId_fkey";
ALTER TABLE "Project" DROP COLUMN "forkedFromId";
