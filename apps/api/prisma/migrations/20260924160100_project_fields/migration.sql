-- Real fields for what the redesign used to infer.
--
-- A card shows a type badge, a status pill and a one-line pitch. Until now the
-- UI read the pitch off the first paragraph of the description and could not
-- show type or status at all. Each becomes a column here.

CREATE TYPE "ProjectType" AS ENUM ('APP', 'RESEARCH', 'FILM', 'DESIGN', 'AUDIO', 'HARDWARE', 'WRITING', 'OTHER');
CREATE TYPE "ProjectStatus" AS ENUM ('IN_PROGRESS', 'SHIPPED', 'HELP_WANTED');

-- Link-only visibility: opens for anyone with the URL, listed nowhere.
ALTER TYPE "Visibility" ADD VALUE 'UNLISTED';

ALTER TABLE "Project"
  ADD COLUMN "pitch" TEXT,
  ADD COLUMN "status" "ProjectStatus",
  ADD COLUMN "type" "ProjectType";

-- A version is now also an update: the note is what the timeline shows.
ALTER TABLE "ProjectVersion" ADD COLUMN "note" TEXT;

CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_type_idx" ON "Project"("type");

-- Split existing descriptions the way the UI already read them: the first
-- paragraph is the pitch and the rest is the story. Skipped when the first
-- paragraph is a heading or too long to be a pitch, so nothing is mangled —
-- those projects simply have no pitch until their owner writes one.
UPDATE "Project" p
SET "pitch" = s.parts[1],
    "description" = NULLIF(btrim(array_to_string(s.parts[2:], E'\n\n'), E' \n\r\t'), '')
FROM (
  SELECT "id", regexp_split_to_array(btrim("description", E' \n\r\t'), E'\\n[ \\t\\r]*\\n') AS parts
  FROM "Project"
  WHERE "description" IS NOT NULL AND btrim("description", E' \n\r\t') <> ''
) s
WHERE p."id" = s."id"
  AND s.parts[1] !~ '^#'
  AND length(s.parts[1]) <= 280;

-- Search now weighs the pitch alongside the tags. The generated column has to
-- be dropped and re-added for the new expression to apply to existing rows.
DROP INDEX IF EXISTS "Project_searchVector_idx";
ALTER TABLE "Project" DROP COLUMN "searchVector";
ALTER TABLE "Project" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce("pitch", '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, uofthub_tags_text("tags")), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce("description", '')), 'C')
  ) STORED;
CREATE INDEX "Project_searchVector_idx" ON "Project" USING GIN ("searchVector");
