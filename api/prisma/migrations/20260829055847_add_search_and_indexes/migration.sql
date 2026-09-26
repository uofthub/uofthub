-- Full-text search.
--
-- Replaces the ILIKE '%term%' the directory used to run: that can be served by
-- no index at all, so every search was a sequential scan over every project.
--
-- A STORED generated column rather than a trigger — Postgres keeps it in step
-- with the row itself, so there is no path where a write updates the project
-- and forgets the vector. Every function in the expression must be IMMUTABLE,
-- which is why the regconfig is spelled out: the one-argument to_tsvector(text)
-- depends on default_text_search_config and is only STABLE.
--
-- Weights rank a title match above a tag match above a description match.
--
-- array_to_string is only STABLE — it is declared over anyarray, and output
-- formatting for some element types depends on session settings. For text[] it
-- is genuinely immutable, so this wrapper narrows it to that case and says so,
-- which is what lets it appear in a generated column.
CREATE FUNCTION uofthub_tags_text(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT array_to_string($1, ' ') $$;

ALTER TABLE "Project" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, uofthub_tags_text("tags")), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce("description", '')), 'C')
  ) STORED;

-- CreateIndex
CREATE INDEX "Comment_projectId_createdAt_idx" ON "Comment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE INDEX "Project_visibility_createdAt_idx" ON "Project"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Project_ownerId_createdAt_idx" ON "Project"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Project_viewCount_idx" ON "Project"("viewCount");

-- CreateIndex
CREATE INDEX "Project_searchVector_idx" ON "Project" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "ProjectCollaborator_userId_idx" ON "ProjectCollaborator"("userId");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_idx" ON "ProjectFile"("projectId");

-- CreateIndex
CREATE INDEX "ProjectFile_orgId_idx" ON "ProjectFile"("orgId");
