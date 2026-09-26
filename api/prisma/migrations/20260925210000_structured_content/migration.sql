-- Optional sections and short labelled details on a project.
--
-- Both are JSONB lists validated by lib/projectContent.ts, which strips empty
-- entries before anything is stored: a section left blank is not a row here
-- with an empty body, it is simply absent. NULL means none.
ALTER TABLE "Project"
  ADD COLUMN "sections" JSONB,
  ADD COLUMN "details" JSONB;

-- A version snapshots what the project said, so it takes both too.
ALTER TABLE "ProjectVersion"
  ADD COLUMN "sections" JSONB,
  ADD COLUMN "details" JSONB;

-- ── Details that were written into the description ───────────────────────────
--
-- Until now the post form flattened its free-text answers into the description
-- as paragraphs of the form `**Runtime:** 6:12` (composeDescription in
-- apps/web/src/pages/post/compose.ts). Those move into `details`, in order.
--
-- Only whole paragraphs, only the five labels that form ever wrote, and only
-- single-line values short enough to be a detail — so a student's own bold
-- text, or a long "**Credits:**" paragraph they wrote by hand, is left alone.
--
-- Kept as a function rather than inlined so the test suite can run it against
-- fixtures (see lib/projectContent.test.ts). It is not used by the app.
CREATE FUNCTION uofthub_split_legacy_details(body text) RETURNS jsonb
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
  AS $$
DECLARE
  para text;
  m text[];
  found jsonb := '[]'::jsonb;
  kept text[] := ARRAY[]::text[];
BEGIN
  IF body IS NULL OR btrim(body, E' \n\r\t') = '' THEN
    RETURN jsonb_build_object('details', NULL, 'description', body);
  END IF;
  FOREACH para IN ARRAY regexp_split_to_array(btrim(body, E' \n\r\t'), E'\\n[ \\t\\r]*\\n') LOOP
    m := regexp_match(
      btrim(para, E' \n\r\t'),
      '^\*\*(Supervisor or lab|Runtime|Credits|Performers|Published in):\*\*[ \t]+([^\n]{1,200})$'
    );
    IF m IS NULL THEN
      kept := kept || para;
    ELSE
      found := found || jsonb_build_array(
        jsonb_build_object('label', m[1], 'value', btrim(m[2], E' \t\r'))
      );
    END IF;
  END LOOP;
  IF jsonb_array_length(found) = 0 THEN
    RETURN jsonb_build_object('details', NULL, 'description', body);
  END IF;
  RETURN jsonb_build_object(
    'details', found,
    'description', NULLIF(btrim(array_to_string(kept, E'\n\n'), E' \n\r\t'), '')
  );
END
$$;

UPDATE "Project" p
SET "details" = s.split -> 'details',
    "description" = s.split ->> 'description'
FROM (
  SELECT "id", uofthub_split_legacy_details("description") AS split
  FROM "Project"
  WHERE "description" ~ '\*\*(Supervisor or lab|Runtime|Credits|Performers|Published in):\*\*'
) s
WHERE p."id" = s."id" AND s.split -> 'details' <> 'null'::jsonb;

-- ── Search ───────────────────────────────────────────────────────────────────
--
-- Section and detail text joins the search vector at the description's weight.
-- The same narrowing argument as uofthub_tags_text: jsonb_path_query is
-- immutable, and these only read the fields the app writes, so they may be
-- declared IMMUTABLE and used in a generated column. `lax` paths skip a
-- missing field rather than raising, so a row written outside the app cannot
-- make an insert fail.
CREATE FUNCTION uofthub_sections_text(jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT coalesce(string_agg(v #>> '{}', ' '), '')
    FROM (
      SELECT jsonb_path_query(coalesce($1, '[]'::jsonb), 'lax $[*].title') AS v
      UNION ALL SELECT jsonb_path_query(coalesce($1, '[]'::jsonb), 'lax $[*].body')
      UNION ALL SELECT jsonb_path_query(coalesce($1, '[]'::jsonb), 'lax $[*].items[*].label')
      UNION ALL SELECT jsonb_path_query(coalesce($1, '[]'::jsonb), 'lax $[*].items[*].body')
    ) parts
    WHERE jsonb_typeof(v) = 'string'
  $$;

CREATE FUNCTION uofthub_details_text(jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
    SELECT coalesce(string_agg(v #>> '{}', ' '), '')
    FROM (
      SELECT jsonb_path_query(coalesce($1, '[]'::jsonb), 'lax $[*].label') AS v
      UNION ALL SELECT jsonb_path_query(coalesce($1, '[]'::jsonb), 'lax $[*].value')
    ) parts
    WHERE jsonb_typeof(v) = 'string'
  $$;

-- A generated column's expression cannot be altered in place; it is dropped
-- and re-added, which recomputes every row. The index goes with it.
DROP INDEX IF EXISTS "Project_searchVector_idx";
ALTER TABLE "Project" DROP COLUMN "searchVector";
ALTER TABLE "Project" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce("pitch", '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, uofthub_tags_text("tags")), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce("description", '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, uofthub_sections_text("sections")), 'C') ||
    setweight(to_tsvector('english'::regconfig, uofthub_details_text("details")), 'C')
  ) STORED;
CREATE INDEX "Project_searchVector_idx" ON "Project" USING GIN ("searchVector");
