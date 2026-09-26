-- A version records the whole of a project's content, not only its text:
-- the course it was made for, what it drew on, and what it produced.
-- Versions saved before this have none of the three, which reads as "not
-- recorded", not as "had none".
ALTER TABLE "ProjectVersion"
  ADD COLUMN "courseCode" TEXT,
  ADD COLUMN "references" JSONB,
  ADD COLUMN "outputs" JSONB;
