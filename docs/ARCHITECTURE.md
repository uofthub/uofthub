# Architecture

This document describes the system design of uofthub. It will evolve as the stack is finalized.

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
    Projects     People     Courses
        │
   ┌────┼─────┐
   ▼    ▼     ▼
 Files GitHub  Links
```

Future graph: Students → Projects → People → Courses → Research → Clubs → University.

---

## Data model (draft)

### User
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| email | string | must be `@mail.utoronto.ca` or `@utoronto.ca` |
| name | string | |
| faculty | string | |
| program | string | |
| class_year | int | |
| bio | string? | |
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
| description | text | |
| tags | string[] | course, faculty, topic |
| visibility | enum | `private`, `uoft`, `public` |
| taken_down_at | timestamp? | set when a moderator takes the project down; while set, the owner cannot change visibility or fork the project — see [Moderation](#moderation) |
| created_at | timestamp | |
| updated_at | timestamp | |

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
| org_id | uuid? | the group these bytes are billed to, stamped at upload; null means the uploader's personal quota — see [File storage § group quotas](#limits--student-groups) |
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
| verification_deadline | timestamp? | 7 days from creation/info-request; cleared on submission, auto-delete on expiry |
| verification_note | text? | the group's most recent verification submission |
| review_note | text? | the admin's note back — what was missing, or why it was denied |
| verified_at | timestamp? | when it was approved; the start point for term storage grants |
| created_at | timestamp | |

### OrgStorageGrant
One row per (group, academic term): the 10GB granted for that term. A ledger rather than a computed total, because allowances stack and the record of what was actually granted is the thing that has to survive.

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
| image_url | string? | http(s) only — a URL, not an upload, so an activity never bills anyone's quota |
| created_at | timestamp | |

### Notification
In-app feed only for now — no email is sent for these yet. See [ROADMAP.md § Notifications](ROADMAP.md).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | recipient |
| type | enum | `COLLABORATOR_INVITED`, `COLLABORATOR_RESPONDED`, `ACCESS_REQUESTED`, `ACCESS_REQUEST_DECIDED`, `PROJECT_MODERATED` |
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

---

## Auth

Students authenticate via U of T email verification (Google/Microsoft OAuth restricted to `@mail.utoronto.ca` / `@utoronto.ca` domains). Non-U of T visitors can browse public projects without an account.

Open question: exact mechanism for verifying student status (domain-restricted OAuth is the leading option for MVP).

---

## Visibility model

Projects have three visibility levels:

| Level | Who can see |
|---|---|
| `private` | Owner and invited collaborators only |
| `uoft` | Any authenticated U of T user |
| `public` | Anyone on the internet |

Default: `private`. Students must explicitly open visibility up.

TA/professor access is granted per-project by the student owner (generates a view-only invite link), never platform-wide.

---

## AI discovery

`GET /discover?q=` reads a natural-language query — "what have students built in CSC309 this year" — and answers it out of the ordinary project index.

The model's only job is to fill five fields: `search`, `faculty`, `tag`, `sort`, `within`. It never sees the database and never produces a query. The response is constrained by a Zod schema (`lib/discovery.ts`) with enums for faculty, sort and time window; the route then applies those fields through Prisma, inside the same `visibleProjectWhere` filter every other read uses. **The model's output is untrusted input** — the schema is the boundary that keeps a creative answer from becoming a creative query, and no amount of prompt injection in the query text can widen what a caller is allowed to see.

Without `ANTHROPIC_API_KEY` the route runs the raw query as a keyword search and returns `interpreted: false`, which the page shows as a one-line note. Same degradation as email: nothing breaks, the feature is just less clever. Cost control is a session-keyed 20/hour limit (`lib/rateLimit.ts`), a 300-character query cap, `effort: 'low'`, and the endpoint requiring a session at all — an anonymous visitor can still use the free keyword search on `/projects`.

The interpreted filters are returned to the client and rendered as chips. This is a UX decision worth keeping: a student who sees "about machine learning · faculty Engineering" understands why they got nothing back, where a black box returning an empty grid just looks broken.

---

## Moderation

Anyone signed in can report a project whose visibility is `uoft` or `public`. A `private` project is unreportable — nobody outside the owner and its accepted collaborators can see it, so there is nothing for a moderator to act on. Self-reports are rejected, as is a second open report on a project the same person has already reported.

`POST /projects/:id/report` is rate-limited to 5 per hour, **keyed by session cookie rather than by IP**. This is the one place that deviates from the IP-keyed default the upload routes use: campus wifi puts thousands of students behind a handful of NAT addresses, and an IP budget would let one abuser exhaust reporting for everyone on the same network. The limiter runs in `onRequest`, before `authenticate` has verified the JWT, so the raw cookie — not `request.user` — is what's available as a key.

Moderators are `User.is_admin` accounts. The flag is checked against the database on every admin request (`lib/admin.ts`), not read from the JWT: sessions last 7 days, so a token minted while the flag was set would otherwise keep moderator powers until it expired. It is granted only from the database — `pnpm --filter @uofthub/api grant-admin <email>` — because the first moderator has to come from outside the app and no route should be able to hand out the flag. This is the same gate Phase 3's org-verification portal will register behind.

`GET /admin/reports?status=` serves the queue (`OPEN` by default, oldest first — the report waiting longest is the next to decide). `POST /admin/reports/:id/decision` takes one of three decisions:

| Decision | Effect | Owner told? |
|---|---|---|
| `DISMISS` | Closes the report. | No — the owner never learns a dismissed report existed |
| `WARN` | Project stays up. | Yes, with the moderator's note |
| `TAKE_DOWN` | Visibility forced to `private`, `taken_down_at` stamped. | Yes, with the moderator's note |

A take-down deletes nothing: the project, its files and its version history stay in the owner's account, and the owner can still edit it. What `taken_down_at` buys is that `PATCH /projects/:id` refuses any visibility change while it is set, and `POST /projects/:id/fork` refuses to copy the project at all — a fork would otherwise come back with a clean `taken_down_at` and be one click from public again. Only a moderator can clear it.

Deciding a take-down also closes every other open report on the same project with the same decision. A project that drew one report usually drew several, and without this the owner is notified once per duplicate.

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
| Per-account storage quota | 2GB total, per person, indefinite |
| Per-project file count | 20 files (soft cap) |

The per-account quota does not reset annually or expire on graduation — it's tied to the person, not to an academic-year clock (there's no reliable way to tell an inactive alumnus from a currently-enrolled student, and alumni-persistent portfolios are already on the roadmap).

**Limits — student groups**

Clubs and research labs (the `Organization` model) are metered separately from individual accounts, since a group turns over executives and runs on a term-based rhythm rather than a person's indefinite timeline. Per-file type/size limits above still apply; only the total-quota scope differs:

| Scope | Limit |
|---|---|
| Per-term storage allowance | 10GB, granted fresh each academic term and stacking with prior terms — nothing is deleted when a term rolls over |
| Eligibility | Only `VERIFIED` groups get the group quota |

A file is billed to a group when its project is linked to a `VERIFIED` group the uploader belongs to; the group is stamped on `ProjectFile.org_id` at upload rather than derived from the project's org links at read time, so quota already spent cannot move between accounts when links change later. A project linked to several groups bills the one it was linked to first. An unverified group has no allowance at all, so its files simply fall back to the uploader's personal 2GB — group membership never *reduces* what an individual can store.

Term boundaries live in `lib/terms.ts` (Fall/Winter/Summer, computed in UTC, key like `2026F`) and grants are made by `pnpm --filter @uofthub/api grant-term-storage`, which is idempotent on (group, term). Approving a group grants its current term immediately, so a group verified in week 3 can upload without waiting for a term boundary.

Full detail — the verification workflow gating that quota, the per-term stacking rule, and org-page activity publishing — is in [student-groups.md](student-groups.md).

All checks (type and size) run server-side against the actual file, not the client-declared extension or MIME type.

### Avatars

Same storage client and content-validation as project files, restricted to the `images` category (25MB cap). One fixed key per user (`avatars/<id>`) — a new upload always overwrites the previous one rather than accumulating objects. Served via `GET /users/:id/avatar`, a public redirect to a signed URL with `Content-Disposition: inline` (renders in an `<img>`, unlike the project-file download route, which forces `attachment`).

On a brand-new Microsoft sign-in, the account's Graph profile photo is synced in as the avatar automatically — best-effort, and never blocks sign-in if it fails or the account has no photo set. This only ever happens once, at signup: a student who has set their own avatar (`User.avatarIsCustom`) keeps it, and existing accounts linking Microsoft for the first time don't get resynced.

### Requesting more space

A student or group that needs more than the default quota or file-count cap (e.g. a large research dataset, a media-heavy final project, or a club's term-end showcase) can contact the team stating why. Requests are reviewed manually and get a response within 2 business days; approved requests raise that account's or group's limits individually rather than raising the platform-wide default. This keeps defaults tight against misuse while not hard-blocking legitimate edge cases.

**Abuse guardrails**

- Rate-limit uploads per account (per minute/hour) to prevent scripted spam.
- Server-side type/size validation on every upload, independent of client input.
- Manual limit increases are per-account/per-group opt-in, not self-service, so quota can't be trivially bypassed.

---

## Scheduled jobs

Two pieces of housekeeping run on a schedule. Both are CLI scripts rather than timers inside the API process — a cron entry is one line of config, survives a deploy, and cannot double-fire across replicas the way a `setInterval` would.

| Job | Command | Cadence | What it does |
|---|---|---|---|
| Verification sweep | `pnpm --filter @uofthub/api sweep-orgs` (`--dry` to list only) | daily | Deletes groups still `PENDING_VERIFICATION` / `INFO_REQUESTED` past their deadline. Not the only enforcement: `POST /orgs/:slug/verify` refuses an expired deadline too, so a missed run delays cleanup rather than reopening the window |
| Term storage grants | `pnpm --filter @uofthub/api grant-term-storage` | monthly | Grants each verified group the 10GB for every term it is owed but hasn't received. Idempotent on (group, term) |

`pnpm --filter @uofthub/api grant-admin <email>` is the third script, but it's operator-run, not scheduled — see [Moderation](#moderation).

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
| Data fetching | TanStack Query | Server state management, caching, background refetch |
| Auth | Google/Microsoft OAuth (domain-restricted) | Easiest student verification for `@mail.utoronto.ca` / `@utoronto.ca` |
| Session | JWT via `@fastify/jwt` | Stateless; works across potential future services |
| File storage | Cloudflare R2 (S3-compatible) | Decoupled from compute; no egress fees; `@aws-sdk/client-s3` talks to it over the S3 API |
| AI discovery | Anthropic API (`claude-opus-5`) via `@anthropic-ai/sdk`, structured output validated with Zod | Turns a natural-language query into a closed set of filters; `apps/api/src/lib/discovery.ts` falls back to keyword search with a warning if `ANTHROPIC_API_KEY` is unset, so no route depends on an AI budget existing |
| Email | Resend | Simple API, generous free tier; `apps/api/src/lib/email.ts` no-ops with a warning if `RESEND_API_KEY` is unset rather than blocking anything |
| Tests | Vitest + `app.inject()` against a real Postgres | Same toolchain as Vite/TS, no extra config; the rules worth testing are Prisma queries, so a mocked database would test nothing real |
| CI | GitHub Actions | `typecheck` + API tests + `build` + `lint` on every PR (`.github/workflows/ci.yml`) |
| Hosting (API + database) | Railway | Managed Postgres next to the API, so there's no separate database account or connection-pooling story at this size; deploys from the Dockerfile in `apps/api/` |
| Hosting (web) | Cloudflare Pages | Static build, free, and already where R2 lives — the storage bucket and the site sit in one dashboard |

---

## Deployment

Three pieces, two platforms, both deploying from `main` on push. CI (`typecheck` → tests → `build` → `lint`) is what gates a PR into `main`; neither platform runs the tests, so a red CI must not be merged.

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

`PORT` is provided by Railway and read by `src/index.ts`; the server binds `0.0.0.0`.

The [scheduled jobs](#scheduled-jobs) are not part of the web service — run them as Railway cron jobs against the same image (`pnpm --filter @uofthub/api sweep-orgs`, `… grant-term-storage`). Until they are scheduled somewhere, expired unverified groups linger (invisible, but not deleted) and verified groups stop receiving new term allowances.

---

## ADRs (Architecture Decision Records)

Significant decisions will be recorded as numbered ADRs in `docs/adr/`. ADR format: context → decision → consequences.
