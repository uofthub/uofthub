# Structured projects

> **Status: approved plan, being built phase by phase.** Each phase ends with tests, `pnpm typecheck && pnpm --filter @uofthub/api test && pnpm build && pnpm lint` passing, and a commit.

A project today is a title, a pitch, one Markdown `description`, tags, files and links. That shape was designed around apps: the post form defaults to "App or website", the story placeholder says "What we built", and every type-specific answer that isn't a URL is flattened into the description as `**Label:** value` by `composeDescription` in `apps/web/src/pages/post/compose.ts`. A research poster, a film, or a CSC211H5 comparison of four approaches has nowhere to put its method, data or results except as headings a student has to invent.

The goal is a project that holds as much or as little as its author wants, across every faculty, and where **anything left empty does not render at all**: no heading, no placeholder, no menu entry.

This extends [ARCHITECTURE.md](ARCHITECTURE.md) and [redesign.md](redesign.md).

---

## What stays

- **`lib/visibility.ts` is the security boundary.** Every new read goes through `canViewProject` / `canViewProjectId` / `visibleProjectWhere`. The show-from date is enforced there and nowhere else (see Phase 1, which also moves three existing checks *into* it).
- **`ProjectFile` and `ProjectLink`** stay as they are. Outputs are a layer over them, not a replacement.
- **Tags**, **`Markdown.tsx`** (section bodies are Markdown, rendered by it), **the CSS and the `components/ui` kit**.
- **`searchVector`** stays a `STORED` generated column, extended to cover the new text.
- **`description`** stays, and becomes the optional *Overview*.

---

## Schema

### `Project`: new columns

| Column | Type | Notes |
|---|---|---|
| `sections` | `Jsonb?` | Ordered array of sections, validated by Zod, empties stripped on save. Null means none. |
| `details` | `Jsonb?` | Ordered array of `{ label, value }`. Replaces the `**Label:** value` lines. |
| `courseCode` | `String?` | Upper-cased, e.g. `CSC211H5`. Indexed. Backfilled from tags. |
| `showFrom` | `Timestamptz?` | Until this instant only the owner and accepted collaborators can see the project, whatever its visibility. |
| `announcedAt` | `Timestamptz?` | When followers were told. Split out from `publishedAt` so that a project with a show-from date can be announced when it appears, not when it was saved. See Phase 1. |
| `templateCode` | `String?` | The course template the project was started from, e.g. `CSC211H5`. |
| `templateVersion` | `Int?` | That template's version at the time. With `templateCode`, lets templates move to the database later (if instructors need to edit them) without losing which projects came from which revision. |

`ProjectVersion` also gets `sections` and `details`, so a version still captures what the project said.

#### `sections` shape

```ts
type SectionKind =
  | 'motivation' | 'method' | 'approaches' | 'data' | 'results'
  | 'examples' | 'considerations' | 'reflection' | 'conclusion' | 'custom'

type Section = {
  id: string            // stable client id (nanoid-length), for anchors and editor keys
  kind: SectionKind
  title?: string        // overrides the type-derived label; required for 'custom'
  body?: string         // Markdown
  items?: { label: string; body?: string }[]  // 'approaches' and 'examples' only
}
```

Rules, enforced by one Zod schema in `apps/api/src/lib/projectContent.ts`:

- **Stripping.** An item with no label and no body is dropped. Then a section with no body and no remaining items is dropped. A title alone is a placeholder, not content, so it's dropped too. Stripping happens in the schema's `transform`, so a stored row is always clean. The renderer also skips empty sections defensively, since rows can be written outside the route.
- One section per kind, except `custom`, which can repeat. The in-page nav lists sections by kind, and two "Results" headings would be ambiguous.
- Limits: 16 sections, 20,000 characters per body, 12 items per section, and a 100 KB serialized cap.
- Array order is display order.

#### Labels by project type

The label is computed at render time from `kind` and the project's `type`, not stored, so changing the type relabels everything. An explicit `title` always wins. That's how course templates name sections ("Task & motivation").

| kind | default | RESEARCH | DESIGN / FILM | APP / HARDWARE | WRITING / AUDIO |
|---|---|---|---|---|---|
| motivation | Motivation | Research question | Brief | The problem | Context |
| method | Method | Methodology | Process | How it works | Process |
| approaches | Approaches compared | Approaches compared | Directions explored | Approaches compared | Approaches |
| data | Data | Data | Sources & materials | Data | Sources |
| results | Results | Findings | Outcome | Results | Outcome |
| examples | Examples | Examples | Stills & examples | Examples | Excerpts |
| considerations | Considerations | Limitations & ethics | Considerations | Trade-offs | Considerations |
| reflection | Reflection | Reflection | Reflection | What I learned | Reflection |
| conclusion | Conclusion | Conclusion | Conclusion | Conclusion | Conclusion |

The `SectionKind` type lives in `packages/types`. Only types can be shared that way: the package ships TypeScript source, which the built API can't import at runtime on Node 22. So the API repeats the kind list as a value in `lib/projectContent.ts`, compile-checked against the type in both directions, and the label table lives on the web side in `lib/sections.ts`, the only place that needs it. Zod itself stays API-only (see *New dependencies*).

#### `details` shape

`{ label: string; value: string }[]`: an ordered list, not an object, because order is the author's to choose and labels are free text ("Supervisor", "Runtime", "Performers", "Instrument", "Site"). At most 12 entries, 40-character labels, 200-character values. A row is dropped if either side is blank. Duplicate labels are allowed ("Performer" twice is legitimate).

### `ProjectReference`: new table

```prisma
enum ReferenceKind { DATASET PAPER SOFTWARE MODEL BOOK ARCHIVE WEBSITE OTHER }

model ProjectReference {
  id        String        @id @default(uuid())
  projectId String
  kind      ReferenceKind
  title     String
  url       String?       // http(s) only, via safeExternalUrl
  doi       String?       // bare, lower-cased: 10.1000/xyz
  authors   String?
  year      Int?
  note      String?       // "used the 2019 split", "baseline only"
  /// Normalized identity, e.g. doi:10.1000/xyz, arxiv:2101.00001,
  /// github:owner/repo, hf:datasets/owner/name, or a canonical URL.
  /// Null when there is neither a URL nor a DOI.
  key       String?
  position  Int
  searchVector Unsupported("tsvector")?  // generated over title + authors

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, position])
  @@index([key])
}
```

`lib/referenceKey.ts` normalizes the identity and is unit-tested case by case:

- **DOIs** (`doi:`, `https://doi.org/…`, `dx.doi.org`): bare and lower-cased (DOIs are case-insensitive), with trailing punctuation trimmed. arXiv DOIs (`10.48550/arXiv.X`) map to `arxiv:X`.
- **arXiv**: `abs/` and `pdf/` URLs map to `arxiv:<id>` with the version and `.pdf` stripped.
- **GitHub**: `github:owner/repo` from the first two path segments, lower-cased, `.git` stripped.
- **Hugging Face and Kaggle datasets and models**: `hf:datasets/owner/name`, `kaggle:owner/name`.
- **Any other URL**: `https`, lower-cased host without `www.` or `m.`, fragment and tracking parameters (`utm_*`, `fbclid`, `ref`) dropped, remaining parameters sorted, trailing slash dropped.

A DOI wins over a URL when both are given.

"Other projects that used this dataset" is a join on `key`, filtered through `visibleProjectWhere`, the project itself excluded.

### `ProjectOutput`: new table

```prisma
enum OutputKind { POSTER SLIDES PAPER VIDEO AUDIO DEMO CODE DATASET OTHER }

model ProjectOutput {
  id           String     @id @default(uuid())
  projectId    String
  kind         OutputKind
  label        String?    // overrides the kind's label: "Final poster"
  fileId       String?    @unique
  linkId       String?    @unique
  position     Int
  isPrimary    Boolean    @default(false)
  /// R2 key of a browser-generated thumbnail (WebP or JPEG). Null when none
  /// was made, e.g. a small image that is its own thumbnail.
  thumbnailKey String?

  project Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  file    ProjectFile? @relation(fields: [fileId], references: [id], onDelete: Cascade)
  link    ProjectLink? @relation(fields: [linkId], references: [id], onDelete: Cascade)
  @@index([projectId, position])
}
```

Two constraints go into the migration SQL because Prisma's schema language can't express them:

- `CHECK (("fileId" IS NULL) <> ("linkId" IS NULL))`: exactly one target.
- `CREATE UNIQUE INDEX … ON "ProjectOutput"("projectId") WHERE "isPrimary"`: at most one primary per project, enforced by the database rather than by route code remembering to.

Deleting a file or link deletes its output, and its thumbnail object is deleted in the same route. If that output was primary, the project simply has no primary, and the cover falls back as described below.

### Cover resolution (`lib/covers.ts`)

In order:

1. The primary output's `thumbnailKey`.
2. The primary output's file, if it is an image.
3. Today's rule: the first uploaded image.

It still signs only what it is handed, one query for the whole list. `ProjectDetail` also returns outputs with a signed `thumbnailUrl` each, so the gallery can lead with the primary output.

---

## Thumbnails and large images

All generated in the browser at upload time, from the local `File`:

- **PDF** (posters, slides, papers): first page rendered with pdf.js to a canvas, at a width of 1280 px.
- **Video**: a hidden `<video>` on an object URL seeks to about 10% of the duration (at most 3 s), and that frame is drawn to a canvas. No dependency.
- **Images**: see below.

The canvas is encoded as WebP at quality 0.82, falling back to JPEG where `toBlob('image/webp')` returns another type (older Safari). The result is uploaded to `PUT /projects/:id/outputs/:outputId/thumbnail`.

**Why from the local file.** The bucket sends no CORS headers (see the `/preview` route), so a canvas that draws an already-uploaded PDF or video from its signed URL is tainted and can't be exported. Generating before upload avoids that without changing bucket configuration. The cost: files uploaded before this change get no generated thumbnail. Their covers keep working exactly as today, via rule 3. If backfilling them matters later, the fix is a CORS rule on the bucket for `WEB_URL`, not code.

**Large images: keep the original, add a thumbnail.** An image over 1600 px on its long edge, or over 1 MB, gets a 1280 px WebP thumbnail. The original is uploaded untouched. I chose this over the alternatives:

- **Downscaling the upload itself** would lose the thing being shared. A poster or a figure has to stay legible when someone opens it full-size, and the 25 MB image cap already bounds storage.
- **Resizing on the server** (with `sharp`) adds a native binary to the API image, CPU load on the request path, and decoding of untrusted images server-side. The browser already has hardened decoders.
- **The problem is real today, but it's the feeds.** `coverUrls` signs the full original for every card, so a 12 MB phone photo is fetched to draw a 300 px tile. Thumbnails fix that at the point where it hurts.

`createImageBitmap(file, { imageOrientation: 'from-image' })` applies EXIF rotation before drawing, so phone photos aren't sideways.

**The server does not trust a client-made thumbnail.** It must be PNG, JPEG or WebP by magic bytes (the existing `file-type` check), 512 KB at most, and belong to an output of a project the caller owns. It is only ever rendered as an `<img>`. SVG is refused.

**Old uploads get a manual thumbnail.** In the editor, an owner can set or replace any output's thumbnail by choosing an image; it goes through the same resize and the same endpoint.

Link outputs (a YouTube video, a demo site) can get a thumbnail from the existing link import, which already fetches `og:image`. The editor offers it rather than doing it silently.

---

## Show-from date (enforced only in `visibility.ts`)

**Rule.** Before `showFrom`, a project is visible only to its owner and accepted collaborators, whatever its visibility (PUBLIC, UOFT and UNLISTED alike). Everyone else gets the same 404 a private project gives.

**Changes to `visibility.ts`.**

- `canViewProject` checks membership first, then the date, then visibility. It takes `now = new Date()` as a parameter for the tests.
- Its argument type makes `showFrom: Date | null` **required**, so the compiler finds every call site with a hand-written `select`: follow, fork, versions, and the update fan-out.
- `visibleProjectWhere` puts the date condition on the non-member branch:
  `OR: [{ visibility in [PUBLIC, UOFT], OR: [{ showFrom: null }, { showFrom: { lte: now } }] }, owner…, collaborator…]`.
  `users.ts` spreads this fragment next to other keys, so its top level must stay a single `OR`. I'll check each call site.
- **New `listedProjectWhere(signedIn)` and `isListed(project)`.** These replace three checks that live outside `visibility.ts` today: `audienceWhere` in `facets.ts`, `listable` in `collections.ts`, and the spotlight check in `admin.ts`. Without this, facets would count and reveal a hidden project's course, and it could be added to a collection or spotlighted.
- **Report and request-access.** Both compared `visibility === 'PRIVATE'` directly, which confirmed a private id exists (403 instead of 404). They now call `canViewProject` first and 404. One consequence: a TA can't request access to a course project before its show-from date, because as far as they can tell it doesn't exist yet. The owner can still invite them.

**Publishing.** `announcePublish` stamps `publishedAt` with the reveal time, `max(now, showFrom)`, so a hidden project enters feeds on the day it appears rather than the day it was saved. Followers are told once, at that moment:

- If the project is visible now, notify and set `announcedAt`.
- Otherwise, `lib/announcements.ts` claims due rows and marks them in one statement:

  ```sql
  UPDATE "Project" SET "announcedAt" = now()
  WHERE "announcedAt" IS NULL AND "publishedAt" IS NOT NULL AND "showFrom" <= now()
  RETURNING id
  ```

  Only the claimed ids are fanned out, so running several API instances or overlapping runs can't double-notify. It runs once at boot and then on an interval, both registered in `index.ts`, not `buildApp()`, for the same reason `installProcessHandlers` lives there: tests build apps without owning the process.

  The existing rows get `announcedAt = publishedAt` in the migration, so nothing is re-announced.

**Update notes.** An update note on a project that is still hidden only reaches followers who can see it. That already holds because the fan-out filters through `canViewProject`.

**Timezone.** The editor picks a date and the API stores the start of that day in `America/Toronto`.

**Tests.**

- Unit tests in `visibility.test.ts`: before, at and after the date; owner; accepted and pending collaborator; signed out; each visibility; null.
- Route tests: `GET /projects/:id`, the list, search, facets, a profile's list, the feed, comments, reactions, file download and preview, collections, spotlight, report, and request-access. Every one hides the project before the date and shows it after.
- The sweep: a hidden project isn't announced before its date, is announced exactly once after it, and running the sweep again (as a restart does) doesn't re-announce it.

---

## Courses

**Column.** `courseCode` becomes the one source of truth. The migration fills it from the first tag matching the course regex, upper-cased, and removes that tag. If a project had two course-code tags, the second stays a tag.

**Filtering.** `GET /projects` gains `course=`:

- A full code (`CSC211H5`) matches exactly.
- A stem (`CSC211`) matches every campus and weight suffix.

Explore stops searching the full text for a course, so a description that mentions CSC211 no longer files the project under CSC211. Facets, the Related panel, the breadcrumb and the feed's course affinity read the column. `courseCode` joins the search vector at weight A.

**Templates.** A template pre-fills the editor and nothing else: no fields become required, and nothing is locked. Its content:

- `defaultType`
- a suggested primary output kind with a prompt ("Upload your poster as a PDF")
- a list of section stubs `{ kind, title, prompt, items? }`, where `prompt` is placeholder text, never saved
- reference-kind hints

Served by `GET /courses/:code/template`, looked up by exact code and then by stem, 404 when none.

**CSC211H5**

- Type: RESEARCH
- Primary output: POSTER (PDF)
- Sections:
  - Task & motivation (`motivation`)
  - Data & evaluation setup (`data`)
  - Approaches (`approaches`, with items Human baseline / Algorithmic / Deep learning / LLM prompting)
  - Results (`results`)
  - Examples & failure analysis (`examples`)
  - Trade-offs & responsible use (`considerations`)
  - Recommendation (`conclusion`)
- References: DATASET and PAPER suggested.

A section the student leaves empty is stripped on save like any other, so an unfinished template never renders headings.

---

## Faculty filters

A project matches a faculty when its owner's faculty matches, **or any accepted collaborator's does**. This applies to Explore's filter, the feed's program affinity, discover, and the faculty counts in facets, where a project is counted once per faculty rather than once per person. Accepted `VIEWER` rows (TA and instructor access grants) are excluded: access to a project isn't credit for it.

---

## Routes

| Route | Change |
|---|---|
| `POST /projects` | Also accepts `sections`, `details`, `courseCode`, `showFrom`, `references[]`. |
| `PATCH /projects/:id` | Same fields plus `outputs[]`, all written in **one transaction**. `references` and `outputs` replace the whole list when present. |
| List routes | Never carry `sections` or `details`: a card draws none of it and sections can run to 100 KB. `decorate` drops them, and the single-project routes (`GET`, `POST`, `PATCH`, fork) put them back. |
| `GET /projects/:id` | Returns `sections`, `details`, `courseCode`, `showFrom` (only ever in the future for the project's makers, who are the only ones who can load it then), `references`, and `outputs` with signed `thumbnailUrl`s. |
| `GET /projects?course=` | New course filter; the faculty filter now also matches collaborators. |
| `PUT /projects/:id/outputs/:outputId/thumbnail` | New. Multipart, owner only, validated as above. |
| `GET /projects/:id/shared-references` | New. `[{ reference, projects[] }]` for references with a `key`, visibility-filtered, at most 3 projects each. |
| `GET /courses/:code/template` | New. |
| `POST /projects/:id/versions` | Snapshots `sections` and `details` too. |
| `POST /projects/:id/fork` | Copies sections, details and references. It doesn't copy outputs (the files aren't copied), `courseCode`, or `showFrom`: being filed under someone else's course is the original author's claim, not the forker's. |

An output in `outputs[]` is `{ id?, kind, label?, primary?, fileId }` or `{ id?, kind, label?, primary?, link: { label, url } }`. A new link target creates a `ProjectLink`, so the plain links list stays complete. `id` keeps an existing output, and its thumbnail, across a reorder.

Editing stays owner-only, as today.

## Web routes

- `/projects/new` and `/projects/:id/edit` both render **`EditorPage`**. It replaces `PostPage` and `EditProjectDialog`; the InfoCard's *Edit* menu item navigates to it.
- `/projects/new?course=CSC211H5` applies that course's template.
- The files and links dialogs stay for quick edits.

### Publishing safely

For a new project, in this order:

1. `POST /projects` as **PRIVATE**, with the text content.
2. Upload new files.
3. `PATCH` references and outputs.
4. Upload thumbnails.
5. Send invites.
6. A final `PATCH` sets visibility (and `showFrom`).

If anything before step 6 fails, the project exists as a private draft. The editor stays on it, as `/projects/:id/edit`, lists what failed, and retries only that. Nothing half-finished is ever visible.

Editing a project that is already visible saves straight to it. Steps 2–4 are idempotent and the content is one transaction, but there's no staged copy of a live project; see *Not in scope*.

### Project page

- The Overview (`description`), then each non-empty section in order. Details are rows in the info card's facts list, next to Course and Campus, where short labelled facts already live. References and Outputs follow in later phases.
- An in-page contents list, built from the sections that actually rendered.
- References show "Also used in…" from `shared-references`.
- The gallery leads with the primary output.
- The card's main action reads from the primary output ("View poster", "Read paper", "Watch") before falling back to the link heuristics in `projectView.ts`.
- Anything empty isn't rendered. That includes today's owner-only "Write the story" placeholder, which is replaced by the page's Edit button.

---

## Neutral wording

- The post form stops preselecting "App or website". No type is chosen until the student picks one, and type is already nullable.
- The status label "Shipped" becomes "Finished".
- The link-import placeholder ("Paste a GitHub, YouTube…") becomes a list across media.
- The tips stop assuming screenshots.
- The story copy stops saying "What we built".
- A sweep for other CS-first defaults: I'll grep for GitHub, code, demo, ship and screenshot, and list each change in the phase's commit.

---

## Migrations

Each is its own Prisma migration, landing with its phase:

1. **`show_from`**:
   - add `showFrom` and `announcedAt`
   - backfill `announcedAt = publishedAt`
   - add a plain index on `showFrom` for the sweep. Not a partial one: Prisma's schema can't declare a partial index, and one it can't see gets dropped by the next `prisma migrate dev`. The same limit applies to the outputs table's partial unique index in Phase 4, which will need its own answer.
2. **`structured_content`**:
   - add `sections` and `details` (on `Project` and `ProjectVersion`)
   - **backfill details** through `uofthub_split_legacy_details(text)`, kept in the database so the tests can run it against fixtures: move whole paragraphs matching `^\*\*(Supervisor or lab|Runtime|Credits|Performers|Published in):\*\* (.+)$`, the five labels `compose.ts` ever wrote, out of `description` and into `details`, in order; set `description` to null if nothing is left. Only those exact labels are moved, so a student's own bold text is untouched.
   - add IMMUTABLE `uofthub_sections_text(jsonb)` and `uofthub_details_text(jsonb)` (the same narrowing argument as `uofthub_tags_text`)
   - drop and re-add `searchVector` with sections and details at weight C
3. **`references`**: add the enum, the table, a generated `searchVector` on `ProjectReference`, and the indexes. `searchProjectIds` unions matches from both tables, ranking a reference match below a project match. That keeps "generated, so it can't be forgotten" and avoids denormalizing reference text onto `Project`.
4. **`outputs`**: add the enum, the table, the CHECK constraint, and the partial unique index.
5. **`course_code`**:
   - add `courseCode` and its index, and `templateCode` and `templateVersion`
   - backfill from tags and strip the tag
   - re-add `searchVector` with `courseCode` at weight A

---

## Phases

Each phase is independently shippable, and the old post form keeps working until Phase 6 replaces it.

1. **Show-from date and the visibility boundary.** Migration 1; the `visibility.ts` changes; moving the facets, collections and spotlight checks into it; fixing the report and request-access existence leak; publish and announce with the sweep; tests. It's first because it's the security-sensitive change, and it's small enough to review on its own.
2. **Sections and details.** Migration 2; the Zod schema and stripping; the API fields; versions and fork; rendering and the contents list on the project page. `compose.ts` sends free-text answers as `details` instead of Markdown. Tests: schema stripping and limits, the round trip through the routes, the details backfill run against fixture rows, search matching section text.
3. **References.** Migration 3; `referenceKey.ts` with a case-by-case unit test table; the API; `shared-references`; search; the rendering.
4. **Outputs and covers.** Migration 4; the outputs API; the thumbnail endpoint; `covers.ts`; the gallery and main action; `lib/thumbnails.ts` on the web side, with unit tests for the pure parts (sizing, format fallback, kind guessing); pdf.js loaded lazily.
5. **Courses and faculties.** Migration 5; the `course=` filter; facets, Related and the feed reading `courseCode`; the template endpoint and CSC211H5; faculty matching collaborators.
6. **The editor.** `EditorPage` for create and edit; safe publishing; template pre-fill; section, details, references and outputs editors; show-from date picker; remove `PostPage` and `EditProjectDialog`. Web tests for the publishing order (the visibility write is last, and a failure leaves a draft).
7. **Neutral wording and defaults.** Plus updating ARCHITECTURE.md and this document to say what shipped.

---

## New dependencies

- **`pdfjs-dist`** (web only), for PDF first-page thumbnails. No browser API renders a PDF to a canvas, and the poster PDF is the primary output of the first course template, so this can't be skipped. It's loaded with a dynamic `import()` only when a PDF is picked in the editor, so it stays out of every other page's bundle (the same reasoning as the lazy routes in `App.tsx`). Its worker is loaded via Vite's `?url`, with `isEvalSupported: false`, and pinned to a version past CVE-2024-4367.

Nothing else. Zod is already an API dependency. The web app doesn't get it: the API validates and returns the normalized content, and the editor's own checks are limits it can express directly.

---

## What I'd do differently, and why

1. **Course templates in code, not a seeded table** (decided). Templates are plain typed objects in `apps/api/src/lib/courseTemplates.ts`, each with a `version`. A template is product copy that changes rarely and benefits from review, and there's no admin UI to edit a row. Each project stores `templateCode` and `templateVersion`, so templates can move to the database later if instructors need to edit them.
2. **Primary as `isPrimary` plus a partial unique index**, rather than `Project.primaryOutputId`. Ownership of the primary is inherent (it can't point at another project's output), and deleting it can't leave a dangling pointer.
3. **Followers are told when a project appears, not when it's saved** (decided). This needs `announcedAt` and the app's first background job. Never notifying for projects with a show-from date would have been simpler, but it would quietly drop exactly the course work the feature is for.
4. **Course codes leave `tags`.** Keeping both would mean two sources of truth, and `facets.ts` and `projectView.ts` already disagree on edge cases.
5. **References are searched by union, not denormalized** onto `Project`. See migration 3.
6. **Generated thumbnails only for new uploads** (because of bucket CORS). Owners can set one by hand for old uploads; until they do, legacy covers are unchanged.
7. **`canViewProject` requires `showFrom` in its type**, so a forgotten `select` is a compile error rather than a leak.
8. **The owner-only empty placeholders on the project page go.** The brief says empty renders nothing, and the Edit button is where the owner goes to fill things in.

## Not in scope

- Staged edits to a live project (a draft copy published over the original).
- Collaborators editing.
- Server-side thumbnails.
- Automatically backfilling thumbnails for old files.
- An admin UI for templates.
- Changing the `ProjectType` enum.
