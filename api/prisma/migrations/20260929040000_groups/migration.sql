-- Groups are created by moderators, already trusted; the self-serve
-- verification flow's columns go. Nothing was deployed with it.
ALTER TABLE "Organization" DROP COLUMN "status";
ALTER TABLE "Organization" DROP COLUMN "verificationDeadline";
ALTER TABLE "Organization" DROP COLUMN "verificationNote";
ALTER TABLE "Organization" DROP COLUMN "reviewNote";
ALTER TABLE "Organization" DROP COLUMN "verifiedAt";
DROP TYPE "OrgStatus";

-- Membership is agreed to: an admin invites and the person accepts, or the
-- person asks and an admin approves. Everyone already a member stays one.
CREATE TYPE "OrgMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'REQUESTED');
ALTER TABLE "OrgMember" ADD COLUMN "status" "OrgMemberStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "OrgMember" ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "OrgMember" SET "role" = 'MEMBER' WHERE "role" NOT IN ('MEMBER', 'ADMIN');

ALTER TYPE "NotificationType" ADD VALUE 'ORG_INVITED';
ALTER TYPE "NotificationType" ADD VALUE 'ORG_JOIN_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'ORG_MEMBERSHIP_DECIDED';
