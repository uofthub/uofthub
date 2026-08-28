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
| status | enum | `PENDING_VERIFICATION`, `IN_REVIEW`, `INFO_REQUESTED`, `VERIFIED` — not yet implemented, see student-groups.md |
| contact_info | string | submitted at creation, used to notify on a verification decision — not yet implemented |
| verification_deadline | timestamp | 7 days from creation/info-request; auto-delete on expiry — not yet implemented |
| created_at | timestamp | |

### Notification
In-app feed only for now — no email is sent for these yet. See [ROADMAP.md § Notifications](ROADMAP.md).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | recipient |
| type | enum | `COLLABORATOR_INVITED`, `COLLABORATOR_RESPONDED`, `ACCESS_REQUESTED`, `ACCESS_REQUEST_DECIDED` |
| payload | json | denormalized display data (project title, actor name, etc.) captured at creation time |
| read | bool | |
| created_at | timestamp | |

### OrgMember
| Field | Type | Notes |
|---|---|---|
| org_id | uuid | |
| user_id | uuid | |
| role | string | e.g. `ADMIN`, `MEMBER` |

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

Full detail — the verification workflow gating that quota, the per-term stacking rule, and org-page activity publishing — is in [student-groups.md](student-groups.md). None of it is implemented yet; `POST /orgs` today creates and publicly lists a group immediately with no verification step.

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
| Email | Resend | Simple API, generous free tier; `apps/api/src/lib/email.ts` no-ops with a warning if `RESEND_API_KEY` is unset rather than blocking anything |

---

## ADRs (Architecture Decision Records)

Significant decisions will be recorded as numbered ADRs in `docs/adr/`. ADR format: context → decision → consequences.
