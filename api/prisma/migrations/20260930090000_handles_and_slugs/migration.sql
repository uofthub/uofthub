-- Readable addresses: uofthub.com/@handle and uofthub.com/@handle/slug.
-- Existing accounts and projects get theirs here, by the rules in
-- src/lib/handles.ts: `uofthub_slugify` mirrors `slugify`, and the reserved
-- words mirror RESERVED and RESERVED_PROJECT_SLUGS.

-- AlterEnum
ALTER TYPE "ReportReason" ADD VALUE 'IMPERSONATION';

-- Nullable until every row has one.
ALTER TABLE "User" ADD COLUMN "handle" TEXT,
ADD COLUMN "handleChangedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "slug" TEXT;

-- Accents off the common Latin letters (no unaccent extension assumed), then
-- lowercase, anything else a single '-', cut to `maxlen` without a dangling '-'.
CREATE FUNCTION uofthub_slugify(t text, maxlen int) RETURNS text AS $$
  SELECT trim(both '-' from left(
    trim(both '-' from regexp_replace(
      lower(translate(t,
        'ÀÁÂÃÄÅàáâãäåĀāĂăĄąÇçĆćČčÐðĎďÈÉÊËèéêëĒēĖėĘęĚěÌÍÎÏìíîïĪīĮįÑñŃńŇňÒÓÔÕÖØòóôõöøŌōŐőŘřŚśŠšŞşŤťÙÚÛÜùúûüŪūŮůŰűÝýÿŹźŻżŽž',
        'AAAAAAaaaaaaAaAaAaCcCcCcDdDdEEEEeeeeEeEeEeEeIIIIiiiiIiIiNnNnNnOOOOOOooooooOoOoRrSsSsSsTtUUUUuuuuUuUuUuYyyZzZzZz')),
      '[^a-z0-9]+', '-', 'g')),
    maxlen));
$$ LANGUAGE sql IMMUTABLE;

DO $$
DECLARE
  r record;
  base text;
  candidate text;
  n int;
  reserved text[] := ARRAY['admin', 'administrator', 'announcements', 'api', 'help',
    'helpdesk', 'me', 'mod', 'moderator', 'moderators', 'news', 'null', 'official',
    'president', 'registrar', 'root', 'security', 'staff', 'support', 'system', 'team',
    'undefined', 'uoft', 'uofthub', 'uoftofficial', 'utoronto', 'universityoftoronto', 'www'];
  reserved_slugs text[] := ARRAY['edit', 'new', 'projects', 'collections', 'followers',
    'following', 'settings'];
BEGIN
  -- Oldest account first, so whoever was here first keeps the plain name.
  FOR r IN SELECT id, name, "emailVerifiedAt" FROM "User" ORDER BY "createdAt", id LOOP
    IF r."emailVerifiedAt" IS NULL THEN
      UPDATE "User" SET handle = 'unconfirmed-' || r.id WHERE id = r.id;
      CONTINUE;
    END IF;
    base := uofthub_slugify(r.name, 26);
    IF length(base) < 3
      OR replace(replace(base, '-', ''), '_', '') = ANY(reserved)
      OR replace(base, '-', '') LIKE '%uofthub%' THEN
      base := 'student';
    END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "User" WHERE handle = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE "User" SET handle = candidate WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id, "ownerId", title FROM "Project" ORDER BY "createdAt", id LOOP
    base := uofthub_slugify(r.title, 56);
    IF base = '' THEN base := 'project'; END IF;
    IF base = ANY(reserved_slugs) THEN base := base || '-project'; END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "Project" WHERE "ownerId" = r."ownerId" AND slug = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE "Project" SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

DROP FUNCTION uofthub_slugify(text, int);

ALTER TABLE "User" ALTER COLUMN "handle" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE "HandleHistory" (
    "handle" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandleHistory_pkey" PRIMARY KEY ("handle")
);

-- CreateTable
CREATE TABLE "ProjectSlugHistory" (
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSlugHistory_pkey" PRIMARY KEY ("ownerId","slug")
);

-- CreateIndex
CREATE INDEX "HandleHistory_userId_idx" ON "HandleHistory"("userId");

-- CreateIndex
CREATE INDEX "ProjectSlugHistory_projectId_idx" ON "ProjectSlugHistory"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_ownerId_slug_key" ON "Project"("ownerId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- AddForeignKey
ALTER TABLE "HandleHistory" ADD CONSTRAINT "HandleHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSlugHistory" ADD CONSTRAINT "ProjectSlugHistory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSlugHistory" ADD CONSTRAINT "ProjectSlugHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
