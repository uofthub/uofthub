-- Engagement, simplified: reactions are the app's one public signal.
--
-- Before this there were two overlapping ways to say "good work" — a like and
-- four reaction kinds — and the redesigned UI offers exactly three reactions
-- (Impressive, Learned something, Want to collab) and no like button. Nothing
-- anybody already said is thrown away; every row is carried into the kind that
-- means the same thing, keeping its original timestamp, before the old shapes
-- are dropped:
--
--   like             → IMPRESSIVE
--   WELL_DOCUMENTED  → USEFUL      (shown as "Learned something")
--   WOULD_USE        → IMPRESSIVE
--
-- A person who had already chosen the target kind keeps one row, not two —
-- the reaction table's key is (project, user, kind).

-- 1. Likes become Impressive.
INSERT INTO "ProjectReaction" ("projectId", "userId", "kind", "createdAt")
SELECT "projectId", "userId", 'IMPRESSIVE', "createdAt" FROM "ProjectLike"
ON CONFLICT DO NOTHING;

-- 2. The retired kinds fold into the kept ones.
INSERT INTO "ProjectReaction" ("projectId", "userId", "kind", "createdAt")
SELECT "projectId", "userId", 'USEFUL', "createdAt" FROM "ProjectReaction" WHERE "kind" = 'WELL_DOCUMENTED'
ON CONFLICT DO NOTHING;

INSERT INTO "ProjectReaction" ("projectId", "userId", "kind", "createdAt")
SELECT "projectId", "userId", 'IMPRESSIVE', "createdAt" FROM "ProjectReaction" WHERE "kind" = 'WOULD_USE'
ON CONFLICT DO NOTHING;

DELETE FROM "ProjectReaction" WHERE "kind" IN ('WELL_DOCUMENTED', 'WOULD_USE');

-- 3. The reaction enum becomes the design's three.
BEGIN;
CREATE TYPE "ReactionKind_new" AS ENUM ('USEFUL', 'IMPRESSIVE', 'COLLAB');
ALTER TABLE "ProjectReaction" ALTER COLUMN "kind" TYPE "ReactionKind_new" USING ("kind"::text::"ReactionKind_new");
ALTER TYPE "ReactionKind" RENAME TO "ReactionKind_old";
ALTER TYPE "ReactionKind_new" RENAME TO "ReactionKind";
DROP TYPE "ReactionKind_old";
COMMIT;

-- 4. "Want to collab" tells the owner privately who it was. PROJECT_LIKED
--    stays in the enum: old notifications still reference it.
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_COLLAB_INTEREST';

-- 5. Likes are gone.
ALTER TABLE "ProjectLike" DROP CONSTRAINT "ProjectLike_projectId_fkey";
ALTER TABLE "ProjectLike" DROP CONSTRAINT "ProjectLike_userId_fkey";
DROP TABLE "ProjectLike";

-- 6. Saves: a private bookmark, never shown to anyone else, never notifying.
CREATE TABLE "ProjectSave" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSave_pkey" PRIMARY KEY ("userId","projectId")
);

CREATE INDEX "ProjectSave_projectId_idx" ON "ProjectSave"("projectId");

ALTER TABLE "ProjectSave" ADD CONSTRAINT "ProjectSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectSave" ADD CONSTRAINT "ProjectSave_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
