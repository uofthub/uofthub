-- A show-from date, so course work can stay hidden until after grading.
--
-- Until "showFrom", only the owner and accepted collaborators can see the
-- project, whatever its visibility. The rule itself lives in lib/visibility.ts;
-- nothing here enforces it.
--
-- "announcedAt" splits "followers were told" out of "publishedAt". A project
-- published with a future show-from date gets publishedAt = showFrom (so it
-- enters feeds when it appears) but is only announced once that moment passes,
-- by the sweep in lib/announcements.ts.
ALTER TABLE "Project"
  ADD COLUMN "showFrom" TIMESTAMP(3),
  ADD COLUMN "announcedAt" TIMESTAMP(3);

-- Every project published so far was announced when it was published. Without
-- this the sweep would have nothing to go on, but the next publish of each
-- would look unannounced.
UPDATE "Project" SET "announcedAt" = "publishedAt" WHERE "publishedAt" IS NOT NULL;

-- The sweep's read. A plain index rather than a partial one: Prisma's schema
-- cannot declare a partial index, and one it cannot see is dropped by the next
-- `prisma migrate dev`.
CREATE INDEX "Project_showFrom_idx" ON "Project"("showFrom");
