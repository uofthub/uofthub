-- What a project drew on: datasets, papers, software, models, books, archives.
--
-- `key` is the reference's normalized identity (a DOI, an arXiv id, a GitHub
-- repo, or a canonical URL — see lib/references.ts), which is what lets the
-- page say "also used in…" when two projects cite the same dataset however
-- differently they pasted its link.
CREATE TYPE "ReferenceKind" AS ENUM ('DATASET', 'PAPER', 'SOFTWARE', 'MODEL', 'BOOK', 'ARCHIVE', 'WEBSITE', 'OTHER');

CREATE TABLE "ProjectReference" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ReferenceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "doi" TEXT,
    "authors" TEXT,
    "year" INTEGER,
    "note" TEXT,
    "key" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProjectReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectReference_projectId_position_idx" ON "ProjectReference"("projectId", "position");
CREATE INDEX "ProjectReference_key_idx" ON "ProjectReference"("key");

ALTER TABLE "ProjectReference" ADD CONSTRAINT "ProjectReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search. A generated column on this table rather than reference text copied
-- onto Project: a generated column cannot be forgotten by a write path, and a
-- copy could. lib/search.ts unions matches from both tables.
ALTER TABLE "ProjectReference" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, coalesce("authors", '')), 'D')
  ) STORED;
CREATE INDEX "ProjectReference_searchVector_idx" ON "ProjectReference" USING GIN ("searchVector");
