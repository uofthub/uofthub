-- What a project produced — a poster, slides, a paper, a video, a demo — as an
-- ordered layer over the files and links it already has. Nothing is copied:
-- an output points at exactly one ProjectFile or ProjectLink and goes when it
-- does.
CREATE TYPE "OutputKind" AS ENUM ('POSTER', 'SLIDES', 'PAPER', 'VIDEO', 'AUDIO', 'DEMO', 'CODE', 'DATASET', 'OTHER');

CREATE TABLE "ProjectOutput" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "OutputKind" NOT NULL,
    "label" TEXT,
    "fileId" TEXT,
    "linkId" TEXT,
    "position" INTEGER NOT NULL,
    "primaryOfProjectId" TEXT,
    "thumbnailKey" TEXT,

    CONSTRAINT "ProjectOutput_pkey" PRIMARY KEY ("id"),
    -- Exactly one target.
    CONSTRAINT "ProjectOutput_one_target" CHECK (("fileId" IS NULL) <> ("linkId" IS NULL)),
    -- The primary marker can only ever name the output's own project.
    CONSTRAINT "ProjectOutput_primary_is_own" CHECK ("primaryOfProjectId" IS NULL OR "primaryOfProjectId" = "projectId")
);

CREATE UNIQUE INDEX "ProjectOutput_fileId_key" ON "ProjectOutput"("fileId");
CREATE UNIQUE INDEX "ProjectOutput_linkId_key" ON "ProjectOutput"("linkId");
-- At most one primary per project. A unique column that is NULL on every
-- other output, rather than a partial unique index on a boolean: Prisma's
-- schema can express this, and would drop a partial index it cannot see.
CREATE UNIQUE INDEX "ProjectOutput_primaryOfProjectId_key" ON "ProjectOutput"("primaryOfProjectId");
CREATE INDEX "ProjectOutput_projectId_position_idx" ON "ProjectOutput"("projectId", "position");

ALTER TABLE "ProjectOutput" ADD CONSTRAINT "ProjectOutput_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectOutput" ADD CONSTRAINT "ProjectOutput_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectOutput" ADD CONSTRAINT "ProjectOutput_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ProjectLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
