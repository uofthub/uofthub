# Architecture

This document describes the system design of uofthub as it is built today.

---

## Core concepts

```
                Student
                   │
                   ▼
            ┌──────────────┐
            │   Platform   │
            └──────┬───────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    Projects     People     Groups
        │
   ┌────┬───────┼──────────┬────────────┐
   ▼    ▼       ▼          ▼            ▼
 Files Links  Outputs  References  Sections
```

A project is filed under at most one course (`course_code`) and credited to the groups it was built with. Around it sit reactions, saves, threaded comments, versions, follows and collections; around people, follows and direct messages.

---

## Data model

### User
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| email | string | must be `@mail.utoronto.ca` or `@utoronto.ca` |
| name | string | |
| faculty | string | |
| campus | enum? | `UTSG`, `UTM`, `UTSC`. Nullable — added after launch, and nothing obliges a student to say |
| program | string | |
| class_year | int | |
| bio | string? | |
| open_to | string[] | "Open to" chips, up to six short items |
| website_url, github_url, linkedin_url | string? | http(s) only; GitHub and LinkedIn must point at those hosts (`lib/url.ts`) |
| courses | string[] | course codes the student takes; added to the feed's course affinity |
| allow_messages | bool | false stops new conversations, never replies |
| messaging_suspended_at | timestamp? | set when a moderator suspends the student's messaging after a message report; while set they can read but not send. Cleared to lift it |
| avatar_url | string? | either an externally-pasted URL, or `{API_URL}/users/:id/avatar` when `avatar_key` is set — see [File storage § avatars](#file-storage) |
| avatar_key | string? | R2 object key when the avatar lives in our bucket; internal, never sent to the client |
| avatar_is_custom | bool | true once the student has set their own avatar (upload or pasted URL) — blocks the Microsoft sign-in avatar sync from overwriting it |
| is_admin | bool | platform moderator — see [Moderation](#moderation). Set only from the database (`pnpm --filter @uofthub/api grant-admin <email>`); no route grants it |
| created_at | timestamp | |
| updated_at | timestamp | |

### Project
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| owner_id | uuid | FK → User |
| title | string | |
| pitch | string? | the one line a card shows |
| description | text? | the optional Overview |
| sections | jsonb? | optional sections (motivation, method, approaches, results…), stripped of empties on save — see [structured-projects.md](structured-projects.md) |
| details | jsonb? | short labelled facts: `[{ label, value }]` |
| course_code | string? | the course it was made for, upper-cased; the one source of truth for course filters |
| template_code, template_version | string?, int? | the course template it started from |
| type | enum? | `APP`, `RESEARCH`, `FILM`, `DESIGN`, `AUDIO`, `HARDWARE`, `WRITING`, `OTHER` |
| status | enum? | `IN_PROGRESS`, `SHIPPED`, `HELP_WANTED` |
| tags | string[] | topics |
| visibility | enum | `private` (shown as Draft), `uoft`, `public`, `unlisted` |
| forked_from_id | uuid? | the project it was forked from |
| published_at | timestamp? | first time it stopped being private; the feed orders by it — see [feed-and-density.md](feed-and-density.md#publishedat) |
| show_from | timestamp? | hidden from everyone but its makers until then, whatever its visibility |
| announced_at | timestamp? | when followers were told; see [Scheduled jobs](#scheduled-jobs) |
| pinned_at | timestamp? | pinned to the top of the owner's profile, at most six |
| view_count | int | lifetime total, shown to the owner only |
| taken_down_at | timestamp? | set when a moderator takes the project down; while set, the owner cannot change visibility or fork the project — see [Moderation](#moderation) |
| created_at | timestamp | |
| updated_at | timestamp | |

### ProjectReference
A dataset, paper, piece of software, model, book, archive or website the project used. `key` is its normalized identity (a DOI, an arXiv id, a GitHub repo, a canonical URL — `lib/references.ts`), which is how the page names other projects that used the same thing.

### ProjectOutput
What the project produced — poster, slides, paper, video, audio, demo, code, dataset — as an ordered layer over its files and links. Exactly one target (a CHECK). At most one per project is primary (`primaryOfProjectId`, unique); its thumbnail, made in the author's browser, is the project's image everywhere (`lib/covers.ts`).

### ProjectReaction / ProjectSave
A reaction is one row per (user, project, kind), kinds `IMPRESSIVE`, `USEFUL` (shown as Learned something) and `COLLAB` (Want to collab). A save is a private bookmark: it never notifies, and the owner sees only a count. See [redesign.md](redesign.md#engagement-reactions-are-the-only-public-signal).

### Comment / CommentHelpful
Comments with one level of replies (`parent_id`) and Helpful votes; helpful comments are listed first.

### ProjectVersion
A snapshot of the project, including its sections, details and outputs. A version saved with a `note` is an update: it shows on the Updates timeline and notifies the project's followers.

### ProjectDailyView / ProjectViewer
Views per project per day. `ProjectViewer` holds the day's viewer keys (a user id, or a salted hash for a visitor) so each person counts once a day; yesterday's are pruned when a view is recorded.

### Follow
(follower, following) between students.

### Spotlight
A moderator's pick of one project for a Monday-to-Sunday week, with an optional reason.

### OrgProject
"Built with": a project linked to a group its owner belongs to.

### ProjectFollow
Private "tell me about updates" on a project: (user, project). A version saved with a note notifies followers who can still see the project.

### Collection / CollectionItem
A curator's titled set of projects. Readable by anyone; the projects in it are always filtered by the reader's own visibility, and only PUBLIC/UOFT projects can be added. See [redesign.md](redesign.md#what-used-to-be-coming-soon).

### Message
One direct message (sender, recipient, body, read_at). A conversation is just the messages between two people.

### UserBlock
(blocker, blocked). Closes the conversation both ways until the blocker lifts it. The blocked student gets the same "not taking new messages" as an opt-out, so a block is never revealed.

### ProjectCollaborator
| Field | Type | Notes |
|---|---|---|
| project_id | uuid | |
| user_id | uuid | |
| role | enum | `owner`, `collaborator`, `viewer` |
| accepted | bool | collaborators must accept invite |

### ProjectFile
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id | uuid | |
| org_id | uuid? | dormant — was the group a file was billed to under the retired group quotas; no longer written |
| name | string | |
| storage_key | string | R2 object key, not a public URL — downloads go through a signed URL so they still honour project visibility |
| size_bytes | int | |
| mime_type | string? | client-declared, informational only — not trusted for validation |
| uploaded_at | timestamp | |

### ProjectLink
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id | uuid | |
| label | string | e.g. "GitHub", "Demo" |
| url | string | |

### Organization
Clubs and research labs. Full verification/storage/activity policy in [student-groups.md](student-groups.md).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| slug | string | unique |
| name | string | |
| type | enum | `CLUB`, `LAB` |
| description | string | |
| website_url | string | |
| discord_url | string? | invite link; restricted to discord.gg / discord.com hosts, not just any http(s) URL |
| status | enum | `PENDING_VERIFICATION`, `IN_REVIEW`, `INFO_REQUESTED`, `VERIFIED` |
| contact_email | string? | where the verification decision is sent; required at creation |
| contact_role | string? | the role the creator claims to hold, e.g. "president" |
| verification_deadline | timestamp? | dormant — from the retired self-serve verification flow; always null for groups created now |
| verification_note | text? | the group's most recent verification submission |
| review_note | text? | the admin's note back — what was missing, or why it was denied |
| verified_at | timestamp? | when it was approved; the start point for term storage grants |
| created_at | timestamp | |

### OrgStorageGrant
Dormant. It was one row per (group, academic term) for the retired per-term group storage allowance; the table is kept so the history survives, but nothing reads or writes it now that quotas are gone (see [redesign.md](redesign.md#student-groups-and-quotas)).

| Field | Type | Notes |
|---|---|---|
| org_id | uuid | |
| term | string | term key, e.g. `2026F` — see `lib/terms.ts` |
| bytes | bigint | |
| granted_at | timestamp | |

### OrgActivity
A meeting, event, workshop or recap — lighter than a Project, rendered only on the group's own page.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| org_id | uuid | |
| created_by_id | uuid | any member may post; the author or an org admin may delete |
| title | string | |
| description | text? | |
| date | timestamp | defaults to now |
| link | string? | http(s) only |
| image_url | string? | http(s) only — a URL, not an upload, so an activity is a lightweight post rather than a stored file |
| created_at | timestamp | |

### Notification
The bell's feed, polled every 30 seconds. No email is sent for these yet. See [ROADMAP.md § Notifications](ROADMAP.md).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | recipient |
| type | enum | Administrative: `COLLABORATOR_INVITED`, `COLLABORATOR_RESPONDED`, `ACCESS_REQUESTED`, `ACCESS_REQUEST_DECIDED`, `PROJECT_MODERATED`, `MESSAGING_MODERATED`. Social: `PROJECT_COMMENTED`, `COMMENT_REPLIED`, `PROJECT_FORKED`, `PROJECT_REACTED`, `PROJECT_COLLAB_INTEREST`, `PROJECT_UPDATED`, `FOLLOWED_YOU`, `FOLLOWING_PUBLISHED`. `PROJECT_LIKED` is no longer sent; it stays for old rows |
| key | string? | identity of what is announced, so a toggled state (a reaction, a follow) notifies once — see `notifyOnce` in `lib/notifications.ts` |
| payload | json | denormalized display data (project title, actor name, etc.) captured at creation time |
| read | bool | |
| created_at | timestamp | |

### OrgMember
| Field | Type | Notes |
|---|---|---|
| org_id | uuid | |
| user_id | uuid | |
| role | string | e.g. `ADMIN`, `MEMBER` |

### Report
One row per person per project per open complaint. See [Moderation](#moderation).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| reporter_id | uuid | FK → User |
| project_id | uuid | FK → Project |
| reason | enum | `SPAM`, `HARASSMENT`, `ACADEMIC_INTEGRITY`, `INTELLECTUAL_PROPERTY`, `PRIVACY`, `OTHER` |
| details | text? | reporter's free text, capped at 1000 chars |
| status | enum | `OPEN` until decided, then `DISMISSED` / `WARNED` / `TAKEN_DOWN` — the decision itself |
| created_at | timestamp | |
| reviewed_at | timestamp? | set together with `reviewed_by_id` and `review_note` when a moderator decides |
| reviewed_by_id | uuid? | FK → User (the moderator) |
| review_note | text? | shown to the owner on a warning or take-down |

### MessageReport
A reported conversation. Same reasons, statuses and review fields as `Report`, but about a person (`reported_id`) rather than a project, and with `messages` — a JSON snapshot of the last 30 messages between the two, taken when the report is filed. Only someone the reported student has messaged can file one. The moderator's decisions are dismiss, warn, or suspend messaging (stored as `TAKEN_DOWN`); a suspension closes every other open report about the same person.

---

## Auth

Two ways in, both at `/session`:

- **Microsoft OAuth**, restricted to `@mail.utoronto.ca` / `@utoronto.ca` accounts. A brand-new account's Graph photo becomes its avatar.
- **Email + password** (`passwordHash`, scrypt), also restricted to U of T addresses. This is the one that works in local development, since OAuth needs real credentials.

The session is a JWT in an HTTP-only, `SameSite=Lax` cookie, valid for 7 days. Visitors without an account can browse public projects, and a public project, profile or collection can be opened by anyone with the link.

---

## Visibility model

Projects have four visibility levels:

| Level | Shown as | Who can see |
|---|---|---|
| `private` | Draft | Owner and accepted collaborators only |
| `uoft` | U of T | Any signed-in U of T user |
| `public` | Public | Anyone on the internet |
| `unlisted` | Unlisted | Anyone with the link; never listed, never announced to followers |

Default: `private`. Students must explicitly open visibility up.

A **show-from date** hides a project from everyone but its owner and accepted collaborators until that moment, whatever its level — course work posted before grading appears after it. This rule, like every other, lives only in `lib/visibility.ts`; nothing else decides who may see a project.

TA/professor access is granted per-project by the student owner (generates a view-only invite link), never platform-wide.

---

## AI discovery

`GET /discover?q=` reads a natural-language query — "what have students built in CSC309 this year" — and answers it out of the ordinary project index.

The model's only job is to fill six fields: `search`, `faculty`, `campus`, `tag`, `sort`, `within`. It never sees the database and never produces a query. The response is constrained by a Zod schema (`lib/discovery.ts`) with enums for faculty, campus, sort and time window; the route then applies those fields through Prisma, inside the same `visibleProjectWhere` filter every other read uses. **The model's output is untrusted input** — the schema is the boundary that keeps a creative answer from becoming a creative query, and no amount of prompt injection in the query text can widen what a caller is allowed to see.

Without `OPENAI_API_KEY` the route runs the raw query as a keyword search and returns `interpreted: false`, which the page shows as a one-line note. Same degradation as email: nothing breaks, the feature is just less clever. Cost control is a session-keyed 20/hour limit (`lib/rateLimit.ts`), a 300-character query cap, a 2048-token output ceiling, and the endpoint requiring a session at all — an anonymous visitor can still use the free keyword search on `/projects`.

The model is `gpt-5.6-luna` unless `OPENAI_MODEL` overrides it, so pinning a different model is a deployment variable rather than a code change. The provider lives entirely inside `lib/discovery.ts` — the route only ever sees `parseQuery()` returning filters or null, so swapping providers touches one function.

The interpreted filters are returned to the client and rendered as chips. This is a UX decision worth keeping: a student who sees "about machine learning · faculty Engineering" understands why they got nothing back, where a black box returning an empty grid just looks broken.

---

## Error monitoring

Both halves report to [Clueline](https://clueline.dev), and both degrade to nothing without a key — the same contract as email and AI discovery.

**API** (`lib/monitoring.ts`) — a Fastify `onError` hook rather than `setErrorHandler`, so it observes failures without taking over the response. It reports **5xx only**: a 401 on an expired session, a 404 standing in for a private project, a 400 on a bad payload and a 429 from the rate limiter are all the API working correctly, and reporting them would bury real failures in noise. Reports carry the route *pattern* (`/projects/:id`) rather than the filled-in URL — ids are noise for grouping, and a private project's id isn't ours to ship — plus the method, status, request id and, on authenticated routes, the user id. Process-level `unhandledRejection` / `uncaughtException` handlers are installed in `index.ts`, not `buildApp()`, so the test suite doesn't take ownership of the process.

**Web** (`lib/monitoring.tsx`) — `CluelineProvider` wraps the whole tree outside the router, so a crash while the app is still mounting is caught too. Students see a fallback with an optional "what were you doing?" prompt instead of a white screen.

**What is deliberately not sent:** the signed-in student is identified by `userId` alone. The SDK accepts `email` and `name`, which is what would let Clueline contact the person directly, and that is an opt-in we have not taken — mailing a student's U of T address to a third party by default contradicts what `/about` and `/privacy` promise. Taking it later means editing `IdentifyViewer` **and** the third-party list on the privacy page in the same commit.

---

## Moderation

Anyone signed in can report a project whose visibility is `uoft` or `public`. A `private` project is unreportable — nobody outside the owner and its accepted collaborators can see it, so there is nothing for a moderator to act on. Self-reports are rejected, as is a second open report on a project the same person has already reported.

`POST /projects/:id/report` is rate-limited to 5 per hour, **keyed by session cookie rather than by IP**. This is the one place that deviates from the IP-keyed default the upload routes use: campus wifi puts thousands of students behind a handful of NAT addresses, and an IP budget would let one abuser exhaust reporting for everyone on the same network. The limiter runs in `onRequest`, before `authenticate` has verified the JWT, so the raw cookie — not `request.user` — is what's available as a key.

Moderators are `User.is_admin` accounts. The flag is checked against the database on every admin request (`lib/admin.ts`), not read from the JWT: sessions last 7 days, so a token minted while the flag was set would otherwise keep moderator powers until it expired. It is granted only from the database — `pnpm --filter @uofthub/api grant-admin <email>` — because the first moderator has to come from outside the app and no route should be able to hand out the flag. Every admin route sits behind this one gate.

The `/admin` page (Moderation, in the account menu for moderators only) has four tabs: **Project reports**, **Message reports**, **Groups** (create a group, decide any left over from the old verification flow) and **Spotlight** (pick the week's project).

`GET /admin/reports?status=` serves the queue (`OPEN` by default, oldest first — the report waiting longest is the next to decide). `POST /admin/reports/:id/decision` takes one of three decisions:

| Decision | Effect | Owner told? |
|---|---|---|
| `DISMISS` | Closes the report. | No — the owner never learns a dismissed report existed |
| `WARN` | Project stays up. | Yes, with the moderator's note |
| `TAKE_DOWN` | Visibility forced to `private`, `taken_down_at` stamped. | Yes, with the moderator's note |

A take-down deletes nothing: the project, its files and its version history stay in the owner's account, and the owner can still edit it. What `taken_down_at` buys is that `PATCH /projects/:id` refuses any visibility change while it is set, and `POST /projects/:id/fork` refuses to copy the project at all — a fork would otherwise come back with a clean `taken_down_at` and be one click from public again. Only a moderator can clear it.

Deciding a take-down also closes every other open report on the same project with the same decision. A project that drew one report usually drew several, and without this the owner is notified once per duplicate.

Message reports work the same way, about a person rather than a project: `GET /admin/message-reports`, and a decision of dismiss, warn, or suspend messaging (`User.messaging_suspended_at`), which sends `MESSAGING_MODERATED`. See [MessageReport](#messagereport).

---

## File storage

Object storage: Cloudflare R2 (S3-compatible). The bucket is private — files are never served from a public URL; every download goes through `GET /projects/:id/files/:fileId/download`, which checks project visibility and redirects to a signed URL that expires in 5 minutes.

**Allowed file types** — allowlisted by category rather than a short fixed list, so students aren't forced to convert files before uploading:

| Category | Extensions |
|---|---|
| Docs | `.pdf`, `.doc`, `.docx`, `.ppt`, `.pptx`, `.xls`, `.xlsx`, `.csv`, `.txt`, `.md` |
| Images | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp` |
| Video | `.mp4`, `.webm` |
| Audio | `.mp3`, `.wav` |
| Archives | `.zip` |

Executables and scripts (`.exe`, `.sh`, `.bat`, etc.) are always rejected — a security boundary, not a friction one. Storage cost is controlled via per-file/per-project size limits, not by narrowing formats.

**Limits — individual accounts**

| Scope | Limit |
|---|---|
| Per-file (docs/images) | 25MB |
| Per-file (video) | 250MB — larger videos should be hosted externally (YouTube, etc.) and attached via `ProjectLink` instead of uploaded |
| Per-file (archives) | 100MB |
| Per-project file count | 20 files (soft cap) |

There is no per-account or per-group storage quota. The 2GB personal quota and the 10GB per-term group allowance were removed with the redesign — they were enforcement for a scale the platform hasn't reached, and the per-file limits and file-count cap above already bound what any one project can hold. When storage costs make a quota worth having again, it should be designed then against real usage, not restored from the old numbers. See [redesign.md](redesign.md#student-groups-and-quotas).

All checks (type and size) run server-side against the actual file, not the client-declared extension or MIME type.

### Avatars

Same storage client and content-validation as project files, restricted to the `images` category (25MB cap). One fixed key per user (`avatars/<id>`) — a new upload always overwrites the previous one rather than accumulating objects. Served via `GET /users/:id/avatar`, a public redirect to a signed URL with `Content-Disposition: inline` (renders in an `<img>`, unlike the project-file download route, which forces `attachment`).

On a brand-new Microsoft sign-in, the account's Graph profile photo is synced in as the avatar automatically — best-effort, and never blocks sign-in if it fails or the account has no photo set. This only ever happens once, at signup: a student who has set their own avatar (`User.avatarIsCustom`) keeps it, and existing accounts linking Microsoft for the first time don't get resynced.

### Requesting more room

A student or group that needs more than the per-file size or file-count cap (e.g. a large research dataset, or a video longer than 250MB) can contact the team stating why. Requests are reviewed manually; the usual answer for very large files is to host them externally and attach a link.

**Abuse guardrails**

- Rate-limit uploads per account (per minute/hour) to prevent scripted spam.
- Server-side type/size validation on every upload, independent of client input.

---

## Link import

`POST /projects/import` is the only route where the server fetches a URL a user chose. `lib/linkImport.ts` resolves every hostname through a DNS lookup that refuses the connection if any address is private, loopback, link-local, CGNAT, multicast or otherwise not public — checked on the address actually dialled, so DNS rebinding cannot slip past a pre-check. IP literals are checked directly; only http(s) on ports 80/443; at most three redirects, each re-checked; a 6-second timeout and byte caps (768 KB HTML, 4 MB image). Images come back as bytes (PNG/JPEG/WebP/GIF, never SVG) and go through the normal upload validation when the project is posted. Rate-limited to 20 per 10 minutes per session.

## Search

Project search runs on a Postgres `tsvector`, not `ILIKE`.

`Project.searchVector` is a `GENERATED ALWAYS ... STORED` column over the title and course (weight A), pitch and tags (B), and the description, sections and details (C), with a GIN index on it. `ProjectReference` has its own over title and authors, and `lib/search.ts` unions the two, ranking a reference match at half weight. Generated rather than trigger-maintained so there is no write path that updates a project and forgets its vector. The expression spells out `'english'::regconfig` because the one-argument `to_tsvector(text)` is only STABLE, and a generated column needs IMMUTABLE; `uofthub_tags_text` exists for the same reason, narrowing `array_to_string` to the `text[]` case where it is genuinely immutable.

`lib/search.ts` turns a query into a prefix `tsquery` (`robotics:*`), dropping everything non-alphanumeric so nothing can reach `to_tsquery` as syntax and 500 the directory. It returns **ids only**, capped at 1,000 by rank, and the caller feeds them back into the same Prisma query it always ran — visibility stays in `visibleProjectWhere` and is never re-expressed in SQL, because a second copy of the rule is what eventually drifts and leaks a private project.

Two consequences worth knowing: matching is by whole stemmed word plus prefix, so a mid-word substring ("botic" inside "robotics") no longer matches; and a query matching more than 1,000 projects cannot be paged past the cap. Measured at 40k rows, the old `ILIKE '%term%'` sequential scan took ~74ms and the indexed lookup ~1ms.

---

## Scheduled jobs

One, in process: the **announcement sweep** (`lib/announcements.ts`). A project published with a future show-from date is announced to its owner's followers when that date passes, not when it was saved. The sweep runs at boot and every five minutes, registered in `index.ts` rather than `buildApp()` so tests never start a timer. It claims and marks due projects in one `UPDATE … RETURNING`, so several instances, or overlapping runs, cannot announce a project twice.

The two that existed before — the verification sweep (`sweep-orgs`) and term storage grants (`grant-term-storage`) — went with self-serve group verification and group quotas, along with `.github/workflows/scheduled.yml`. Other housekeeping that would need a timer is done inline instead: `lib/views.ts` prunes yesterday's viewer keys when it records a view.

`pnpm --filter @uofthub/api grant-admin <email>` is the one operator script — run by hand, not scheduled. See [Moderation](#moderation).

---

## Stack decisions

| Concern | Decision | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces | Shared types between api/web without publishing; fast installs |
| Frontend | React 19 + Vite | Fast DX, strong ecosystem, no framework lock-in at this scale |
| Backend | Fastify 5 | Faster than Express, built-in JSON Schema validation, good TS support |
| Language | TypeScript throughout | Type safety across the API boundary via `@uofthub/types` |
| ORM | Prisma | Clean migrations, generated TS types, good Postgres support |
| Database | PostgreSQL | Relational model fits the social graph; Prisma handles migrations |
| Routing (web) | React Router v7 | Standard choice, no SSR complexity needed at MVP |
| Styling (web) | Tailwind CSS v4 | Design tokens as a `@theme` in `src/index.css`, redefined for dark mode; components style themselves with utilities, and shared shapes live in `src/components/ui`. See [CONTRIBUTING.md § Styling](CONTRIBUTING.md#styling-appsweb) |
| Data fetching | TanStack Query | Server state management, caching, background refetch |
| Auth | Microsoft OAuth (domain-restricted) + email/password | Microsoft is what every U of T account already has; password sign-in covers local development and anyone who prefers it. Both are restricted to `@mail.utoronto.ca` / `@utoronto.ca` |
| Session | JWT via `@fastify/jwt` | Stateless; works across potential future services |
| File storage | Cloudflare R2 (S3-compatible) | Decoupled from compute; no egress fees; `@aws-sdk/client-s3` talks to it over the S3 API |
| AI discovery | OpenAI Responses API via `openai`, structured output validated with Zod | Turns a natural-language query into a closed set of filters; `apps/api/src/lib/discovery.ts` falls back to keyword search with a warning if `OPENAI_API_KEY` is unset, so no route depends on an AI budget existing. Model defaults to `gpt-5.6-luna` and is overridable with `OPENAI_MODEL` |
| Email | Resend | Simple API, generous free tier; `apps/api/src/lib/email.ts` no-ops with a warning if `RESEND_API_KEY` is unset rather than blocking anything |
| Error monitoring | [Clueline](https://clueline.dev) — `@clueline/core` in the API, `@clueline/react` in the web app | Ships 5xx failures and front-end crashes with the context to act on them, and shows students a calm fallback instead of a white screen. No-ops with a warning when `CLUELINE_API_KEY` / `VITE_CLUELINE_API_KEY` are unset |
| Tests | Vitest — `app.inject()` against a real Postgres for the API, Testing Library + jsdom for the web app | Same toolchain as Vite/TS, no extra config; the rules worth testing are Prisma queries, so a mocked database would test nothing real |
| CI | GitHub Actions | `typecheck` + API tests + web tests + `build` + `lint` on every PR (`.github/workflows/ci.yml`) |
| Hosting (API + database) | Railway | Managed Postgres next to the API, so there's no separate database account or connection-pooling story at this size; deploys from the Dockerfile in `apps/api/` |
| Hosting (web) | Cloudflare Pages | Static build, free, and already where R2 lives — the storage bucket and the site sit in one dashboard |

---

## Deployment

Three pieces, two platforms, both deploying from `main` on push. CI (`typecheck` → API and web tests → `build` → `lint`) is what gates a PR into `main`; neither platform runs the tests, so a red CI must not be merged.

| Piece | Where | How |
|---|---|---|
| API | Railway service | Builds `apps/api/Dockerfile` (repo root as context, per `railway.json`), healthcheck on `/health` |
| Database | Railway Postgres | `DATABASE_URL` is injected by Railway; nothing else references the credentials |
| Web | Cloudflare Pages | Build `pnpm install --frozen-lockfile && pnpm --filter @uofthub/web build`, output directory `apps/web/dist` |

**Migrations run at container boot**, not as a separate release step: the image's command is `prisma migrate deploy && node dist/index.js`, the same ordering the local `predev` script uses, so the server can never accept a request against a schema it doesn't match. A failed migration fails the deploy and Railway keeps the previous container serving.

**The API must live on a subdomain of the web domain** — `api.uofthub.com` alongside `uofthub.com`. The session cookie is `SameSite=Lax`, which browsers scope by registrable domain: a subdomain is same-site and the cookie rides along on every `credentials: 'include'` request, but an API on a different domain (a `*.railway.app` URL, say) is cross-site and the browser drops it. Every authenticated request would 401 with nothing obviously wrong in the code. Point a custom domain at the Railway service before treating auth as working.

Environment variables in production — see `apps/api/.env.example` for the full list and shape:

- `DATABASE_URL` — injected by Railway.
- `JWT_SECRET` — required; `buildApp()` refuses to boot in production without it rather than silently signing forgeable sessions.
- `WEB_URL` — the site's origin. Drives both the CORS allowlist and the post-OAuth redirect, so a wrong value looks like "sign-in does nothing".
- `API_URL` — this API's own public base, used to build avatar URLs.
- `MICROSOFT_*` — the redirect URI must also be registered on the Azure app registration; they have to match exactly.
- `STORAGE_*` — R2 bucket and token. The bucket stays private; nothing is served from a public bucket URL.
- `RESEND_API_KEY`, `EMAIL_FROM` — email no-ops with a warning when the key is unset, so a deploy without it degrades rather than breaks.
- `OPENAI_API_KEY` — `/discover` falls back to keyword search without it, same as above. `OPENAI_MODEL` is optional and overrides the default model.
- `CLUELINE_API_KEY` — error reporting; unset means errors are logged and not reported. `RELEASE` is optional and tags every report with a version. The web app needs its own `VITE_CLUELINE_API_KEY` set at build time on Cloudflare Pages — a Vite variable is baked into the bundle, so changing it means a rebuild, not a restart.

`PORT` is provided by Railway and read by `src/index.ts`; the server binds `0.0.0.0`.

There are no scheduled jobs to deploy separately: the one sweep runs inside the API process (see [Scheduled jobs](#scheduled-jobs)).

---

## ADRs (Architecture Decision Records)

Significant decisions will be recorded as numbered ADRs in `docs/adr/`. ADR format: context → decision → consequences.
