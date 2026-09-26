-- The course a project was made for, as a column of its own.
--
-- Until now it was whichever tag looked like a course code, which meant a
-- project filed under CSC211 was found by full-text search for "CSC211" —
-- and so was any project whose description merely mentioned it. The column is
-- now the one source of truth; tags are topics.
ALTER TABLE "Project"
  ADD COLUMN "courseCode" TEXT,
  -- The course template a project was started from, and its version then.
  -- Templates live in code (lib/courseTemplates.ts); these record which one
  -- was used so they can move to the database later without losing that.
  ADD COLUMN "templateCode" TEXT,
  ADD COLUMN "templateVersion" INTEGER;

CREATE INDEX "Project_courseCode_idx" ON "Project"("courseCode");

-- The first tag that is a course code becomes the course, upper-cased, and
-- leaves the tags — along with any other spelling of the same code. A second,
-- different course code stays a tag: a project has one course. The pattern
-- mirrors isCourseCode in lib/faculties.ts.
WITH firsts AS (
  SELECT DISTINCT ON (p."id") p."id", upper(btrim(t.tag)) AS code
  FROM "Project" p, unnest(p."tags") WITH ORDINALITY AS t(tag, ord)
  WHERE btrim(t.tag) ~* '^[a-z]{3}[0-9]{3}([hy][0-9])?$'
  ORDER BY p."id", t.ord
)
UPDATE "Project" p
SET "courseCode" = f.code,
    "tags" = (
      SELECT coalesce(array_agg(x.tag ORDER BY x.ord), ARRAY[]::TEXT[])
      FROM unnest(p."tags") WITH ORDINALITY AS x(tag, ord)
      WHERE upper(btrim(x.tag)) <> f.code
    )
FROM firsts f
WHERE p."id" = f."id";

-- The course joins the search vector at the title's weight: searching a code
-- should find the work made for it first.
DROP INDEX IF EXISTS "Project_searchVector_idx";
ALTER TABLE "Project" DROP COLUMN "searchVector";
ALTER TABLE "Project" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce("courseCode", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce("pitch", '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, uofthub_tags_text("tags")), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce("description", '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, uofthub_sections_text("sections")), 'C') ||
    setweight(to_tsvector('english'::regconfig, uofthub_details_text("details")), 'C')
  ) STORED;
CREATE INDEX "Project_searchVector_idx" ON "Project" USING GIN ("searchVector");
