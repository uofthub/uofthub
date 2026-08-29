-- A project whose tags were NULL had a NULL search vector, which made it
-- invisible to search entirely.
--
-- `tags` is a Postgres text[] with no default, so it is nullable, and
-- uofthub_tags_text was declared STRICT — NULL in, NULL out. tsvector
-- concatenation propagates that: `A || NULL || C` is NULL, not `A || C`. The
-- title and description were coalesced; the tags array was not. Routes that
-- create projects always send `tags: []`, so this only bit rows written
-- directly, but it is one missing default away from biting everything.
--
-- Fixed in three places, because any one alone leaves a hole: the data, the
-- column that allowed it, and the function that propagated it.

-- 1. The rows that already have it.
UPDATE "Project" SET "tags" = ARRAY[]::TEXT[] WHERE "tags" IS NULL;
UPDATE "ProjectVersion" SET "tags" = ARRAY[]::TEXT[] WHERE "tags" IS NULL;

-- 2. The columns, so a writer that omits tags gets an empty array.
ALTER TABLE "Project" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProjectVersion" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];

-- 3. The function, so a NULL that reaches it anyway cannot null the vector.
--    STRICT is gone and the coalesce moved inside, where the immutability
--    argument for narrowing array_to_string to text[] still holds.
CREATE OR REPLACE FUNCTION uofthub_tags_text(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT array_to_string(coalesce($1, ARRAY[]::text[]), ' ') $$;

-- Replacing the function does not recompute values already stored, so the
-- column is dropped and re-added to force every row through the fixed
-- expression. The index goes with it and comes back after.
DROP INDEX IF EXISTS "Project_searchVector_idx";
ALTER TABLE "Project" DROP COLUMN "searchVector";
ALTER TABLE "Project" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, uofthub_tags_text("tags")), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce("description", '')), 'C')
  ) STORED;
CREATE INDEX "Project_searchVector_idx" ON "Project" USING GIN ("searchVector");
