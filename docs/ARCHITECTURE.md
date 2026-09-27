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
| published_at | timestamp? | first time it stopped being private; the feed orders by it — see [feed-and-density.md](feed-and-density.md#publishedat) |
| show_from | timestamp? | hidden from everyone but its makers until then, whatever its visibility |
| announced_at | timestamp? | when followers were told; see [Scheduled jobs](#scheduled-jobs) |
| pinned_at | timestamp? | pinned to the top of the owner's profile, at most six |
| view_count | int | lifetime total, shown to the owner only |
| taken_down_at | timestamp? | set when a moderator takes the project down; while set, the owner cannot change visibility — see [Moderation](#moderation) |
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
| title | string? | what they did, as the owner put it ("Designer") |
| accepted | bool | false while an invitation or a TA's access request waits; a no deletes the row |

An accepted `collaborator` edits the project's content — text, files, links, outputs, updates — through the same routes as the owner (`canEditProject` in `lib/visibility.ts`). Who can see it and when, whether it exists, who is credited, pinning and group links stay the owner's. A `viewer` is a TA's read access and is never credited. Invitations go only to addresses that already have an account: emailing an address nobody signed up with is unasked-for mail, and a typo in one is a bounce, both of which count against the sender reputation every other email depends on. `ProjectEmailInvite` holds invitations sent before that rule, which still become a pending row once their address is proven (`lib/accounts.ts`).

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
Clubs and research labs, created by moderators. Every group page is public. Policy in [student-groups.md](student-groups.md).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| slug | string | unique |
| name | string | |
| type | enum | `CLUB`, `LAB` |
| description | string | |
| website_url | string | |
| discord_url | string? | invite link; restricted to discord.gg / discord.com hosts, not just any http(s) URL |
| contact_email | string? | how moderators reach the exec; members only |
| contact_role | string? | the exec's role, e.g. "president" |
| created_at | timestamp | |

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
The bell's feed, pushed to open tabs as it is written — see [Live updates](#live-updates). No email is sent for these yet. See [ROADMAP.md § Notifications](ROADMAP.md).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | recipient |
| type | enum | Administrative: `COLLABORATOR_INVITED`, `COLLABORATOR_RESPONDED`, `ACCESS_REQUESTED`, `ACCESS_REQUEST_DECIDED`, `PROJECT_MODERATED`, `MESSAGING_MODERATED`. Social: `PROJECT_COMMENTED`, `COMMENT_REPLIED`, `PROJECT_REACTED`, `PROJECT_COLLAB_INTEREST`, `PROJECT_UPDATED`, `FOLLOWED_YOU`, `FOLLOWING_PUBLISHED`. `PROJECT_LIKED` is no longer sent; it stays for old rows |
| key | string? | identity of what is announced, so a toggled state (a reaction, a follow) notifies once — see `notifyOnce` in `lib/notifications.ts` |
| payload | json | denormalized display data (project title, actor name, etc.) captured at creation time |
| read | bool | |
| created_at | timestamp | |

### OrgMember
| Field | Type | Notes |
|---|---|---|
| org_id | uuid | |
| user_id | uuid | |
| role | string | `ADMIN` or `MEMBER` |
| status | enum | `ACTIVE`, `INVITED` (waiting on the person), `REQUESTED` (waiting on an admin) — only `ACTIVE` is a member |
| joined_at | timestamp | |

Admins invite (`POST /orgs/:slug/members`), students ask (`POST /orgs/:slug/join`), and each side's answer makes the other `ACTIVE`. A group always keeps an admin while it has other members.

### Report
One row per person per target per open complaint. See [Moderation](#moderation).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| reporter_id | uuid | FK → User |
| target_type | enum | `PROJECT`, `COMMENT`, `COLLECTION`, `USER`, `ORG_ACTIVITY` |
| project_id | uuid? | the project reported, or the one a reported comment is on |
| comment_id / collection_id / activity_id | uuid? | the thing reported; set null if it is deleted |
| subject_user_id | uuid? | whoever posted it — who a warning or suspension is for |
| excerpt | text? | what it said when it was reported |
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

**Every account proves it owns its address** (`User.emailVerifiedAt`). Microsoft sign-in proves it; a password sign-up gets a link by email (`POST /auth/verify`) and cannot sign in until it is followed. Until then the account is nobody's: signing up again with the address starts it over, and a Microsoft sign-in to it discards any password set on it. Signing up with an address that already has an account never touches that account — the address gets an email instead, and every "check your email" route answers the same whatever happened, so none of them reveals which addresses are registered. `POST /auth/forgot-password` and `/auth/reset-password` reset (or first set) a password; `POST /auth/password` changes it when signed in. The links are single-use tokens stored only as SHA-256 hashes (`AuthToken`, `lib/authTokens.ts`). Without `RESEND_API_KEY`, outside production, the links are printed to the API's console instead of emailed.

The session is a JWT in an HTTP-only, `SameSite=Lax` cookie, valid for 7 days, and checked against the database on every use (`lib/session.ts`): each token carries the account's `sessionVersion`, and a password change, a reset, **Sign out everywhere** or deleting the account bumps it, ending every other session at once. The same check refuses writes from a suspended account (`User.suspendedAt`), except the few routes marked `allowSuspended` — signing out, blocking, and deleting or exporting its own data. Visitors without an account can browse public projects, and a public project, profile or collection can be opened by anyone with the link.

**Accounts** — `/settings` changes the password, signs out everywhere, turns off email notifications, downloads everything the student put here as JSON (`GET /users/me/export`) and deletes the account (`DELETE /users/me`, confirmed by typing the email). Deleting cascades to everything the account owns and then removes its storage objects.

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

The model is `gpt-5.6-luna` unless `OPENAI_MODEL` overrides it, so pinning a different model is a deployment variable rather than a code change. The client is shared with link import in `lib/openai.ts`; the discovery prompt and schema live in `lib/discovery.ts` — the route only ever sees `parseQuery()` returning filters or null, so swapping providers touches one function.

The interpreted filters are returned to the client and rendered as chips. This is a UX decision worth keeping: a student who sees "about machine learning · faculty Engineering" understands why they got nothing back, where a black box returning an empty grid just looks broken.

---

## Live updates

The bell and Messages are pushed, not polled. Each signed-in tab holds one Server-Sent Events stream, `GET /events`, and the API sends a bare event name down it — `notification` or `message` — when a row for that student is written (`lib/live.ts`, called from `lib/notifications.ts` and the send-message route). An event carries no data: the tab refetches through the ordinary routes, so the stream can never show anything those routes wouldn't.

SSE rather than WebSockets because the traffic only goes one way, it rides the same session cookie as every other request, and the browser's `EventSource` reconnects by itself.

- **Across instances.** Events travel through Postgres `NOTIFY` on the `live` channel, not an in-memory emitter, because the write and the stream are often on different replicas. Each instance opens one extra `LISTEN` connection (with `pg`, since Prisma cannot listen) the first time a stream connects to it.
- **Best-effort.** A failed publish never fails the request, and whatever is published while a listener is reconnecting is lost. A listener that comes back sends `resync` to its streams, and a tab whose stream reconnects refetches both; window focus is the last backstop.
- **Session checks.** The cookie is verified when the stream opens. Streams end after 30 minutes so the browser reconnects and proves it again; a 25-second heartbeat keeps proxies from closing an idle one.

## Email deliverability

Mail goes out from `notifications@notifications.uofthub.com`, a subdomain whose sending reputation is kept separate from `hello@uofthub.com`. Replies go to `hello@`. U of T mail is on Microsoft 365, which weighs bounces and "Report spam" clicks heavily, so:

- **Only addresses with an account get mail**, apart from sign-up confirmation and the already-registered note. Collaborator invitations need an account for this reason (see [ProjectCollaborator](#projectcollaborator)).
- **Every email has a plain-text part** (`htmlToText` in `lib/email.ts`).
- **Notification emails carry one-click unsubscribe.** `List-Unsubscribe` / `List-Unsubscribe-Post` (RFC 8058) headers point at `POST /email/unsubscribe?token=`, which puts an Unsubscribe button beside the sender in Gmail and Outlook. The footer links to `/unsubscribe`, which works signed out. The token is the user id plus an HMAC of it under `JWT_SECRET`. It turns off notification email and nothing else, so it never expires. Both paths only act on a POST, because Outlook's Safe Links opens every URL in a message and would otherwise unsubscribe everybody on delivery. Account email (confirm, reset) has no unsubscribe: nobody can opt out of it.

## Error monitoring

None for now — a decision still to make before launch. Errors go to the API's own logs (Render keeps them); the web app has no error reporting. Clueline was wired into both halves and has been removed until it is needed again — its setup is in git history (`lib/monitoring.ts`, `lib/monitoring.tsx`). Adding any error reporter back means adding it to the third-party list on `/privacy` in the same commit.

---

## Moderation

Anyone signed in can report a project whose visibility is `uoft` or `public`, a comment, a collection, a profile or a group event (`lib/reports.ts` files them all). A `private` project is unreportable — nobody outside the owner and its accepted collaborators can see it, so there is nothing for a moderator to act on. Self-reports are rejected, as is a second open report on something the same person has already reported. A report keeps an excerpt of what it was about, since a comment can be edited or deleted before a moderator gets to it.

`POST /projects/:id/report` is rate-limited to 5 per hour, **keyed by session cookie rather than by IP**. This is the one place that deviates from the IP-keyed default the upload routes use: campus wifi puts thousands of students behind a handful of NAT addresses, and an IP budget would let one abuser exhaust reporting for everyone on the same network. The limiter runs in `onRequest`, before `authenticate` has verified the JWT, so the raw cookie — not `request.user` — is what's available as a key.

Moderators are `User.is_admin` accounts. The flag is checked against the database on every admin request (`lib/admin.ts`), not read from the JWT: sessions last 7 days, so a token minted while the flag was set would otherwise keep moderator powers until it expired. It is granted only from the database — `pnpm --filter @uofthub/api grant-admin <email>` — because the first moderator has to come from outside the app and no route should be able to hand out the flag. Every admin route sits behind this one gate.

The `/admin` page (Moderation, in the account menu for moderators only) has five tabs: **Reports**, **Messages**, **Users** (find an account; suspend it or lift a suspension, including a messaging-only one), **Groups** (create a group) and **Spotlight** (pick the week's project).

`GET /admin/reports?status=` serves the queue (`OPEN` by default, oldest first — the report waiting longest is the next to decide). `POST /admin/reports/:id/decision` takes one of three decisions:

| Decision | Effect | Owner told? |
|---|---|---|
| `DISMISS` | Closes the report. | No — nobody learns a dismissed report existed |
| `WARN` | It stays up. | Yes, with the moderator's note |
| `TAKE_DOWN` | A project: visibility forced to `private`, `taken_down_at` stamped. A comment, collection or event: removed. A profile: bio, links and photo cleared. | Yes, with the moderator's note |

Any decision can also suspend the account of whoever posted it (`suspend: true`).

A take-down deletes nothing: the project, its files and its version history stay in the owner's account, and the owner can still edit it. What `taken_down_at` buys is that `PATCH /projects/:id` refuses any visibility change while it is set, so the owner can't simply make it public again. Only a moderator can clear it, with **Restore project** on the decided report (`POST /admin/projects/:id/restore`) — the appeal path.

A warning or a take-down also closes every other open report about the same thing with the same decision. Something that drew one report usually drew several, and without this its author is notified once per duplicate.

Comments can be edited by their author and deleted by their author, the project's owner or a moderator; one with replies stays as an empty "deleted" placeholder so the thread survives. Blocking (`lib/blocks.ts`) reaches past messages: neither student can comment on, reply to, react to or follow the other, and existing follows end.

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

A page's metadata only covers a title, a summary and a picture, so the import also reads the page's visible text (scripts, styles, nav and footer stripped; JSON-LD kept) or a repository's README, and `lib/linkEnrich.ts` asks the model to fill the type, status, tags, a Markdown write-up and up to six details — only from what the source states. Like discovery, its output is untrusted: a closed Zod schema, then clamped to the post form's limits, and it only ever becomes a draft the student edits. The page's own summary and a README win over the model's; the model's title wins, since page titles usually carry the site name. Without `OPENAI_API_KEY`, or when the call fails or passes 20 seconds, the import is the metadata alone and `ai: false`. `fill: false` skips the model — the output editor uses it when it only wants a link's preview image.

Model credits are spent as sparingly as the feature allows: no call when the source already gave a title, summary, write-up and three tags; one call per link per day (an in-memory cache, since a team pastes the same page); at most `AI_IMPORT_PER_STUDENT_DAY` (5) calls per student and `AI_IMPORT_PER_DAY` (200) for the whole site per UTC day; about 4,000 characters of input, a 120-word write-up (none when a README already is one) and a 1,500-token output cap. The counters live in memory, so a restart resets them — at worst one extra day's budget.

## Search

Project search runs on a Postgres `tsvector`, not `ILIKE`.

`Project.searchVector` is a `GENERATED ALWAYS ... STORED` column over the title and course (weight A), pitch and tags (B), and the description, sections and details (C), with a GIN index on it. `ProjectReference` has its own over title and authors, and `lib/search.ts` unions the two, ranking a reference match at half weight. Generated rather than trigger-maintained so there is no write path that updates a project and forgets its vector. The expression spells out `'english'::regconfig` because the one-argument `to_tsvector(text)` is only STABLE, and a generated column needs IMMUTABLE; `uofthub_tags_text` exists for the same reason, narrowing `array_to_string` to the `text[]` case where it is genuinely immutable.

`lib/search.ts` turns a query into a prefix `tsquery` (`robotics:*`), dropping everything non-alphanumeric so nothing can reach `to_tsquery` as syntax and 500 the directory. It returns **ids only**, capped at 1,000 by rank, and the caller feeds them back into the same Prisma query it always ran — visibility stays in `visibleProjectWhere` and is never re-expressed in SQL, because a second copy of the rule is what eventually drifts and leaks a private project.

Two consequences worth knowing: matching is by whole stemmed word plus prefix, so a mid-word substring ("botic" inside "robotics") no longer matches; and a query matching more than 1,000 projects cannot be paged past the cap. Measured at 40k rows, the old `ILIKE '%term%'` sequential scan took ~74ms and the indexed lookup ~1ms.

---

## Scheduled jobs

Two, in process. The **maintenance sweep** (`lib/maintenance.ts`) runs hourly and deletes read notifications older than six months, spent or expired auth tokens, and viewer keys older than a day. The **announcement sweep** (`lib/announcements.ts`): A project published with a future show-from date is announced to its owner's followers when that date passes, not when it was saved. The sweep runs at boot and every five minutes, registered in `index.ts` rather than `buildApp()` so tests never start a timer. It claims and marks due projects in one `UPDATE … RETURNING`, so several instances, or overlapping runs, cannot announce a project twice.

The two that existed before — the verification sweep (`sweep-orgs`) and term storage grants (`grant-term-storage`) — went with self-serve group verification and group quotas, along with `.github/workflows/scheduled.yml`. Other housekeeping that would need a timer is done inline instead: `lib/views.ts` prunes yesterday's viewer keys when it records a view.

`pnpm --filter @uofthub/api grant-admin <email>` is the one operator script — run by hand, not scheduled. In the production image only the compiled output exists, so there it is `pnpm grant-admin:prod <email>` from `/repo/api` (Render: the service's Shell tab or `render ssh`). See [Moderation](#moderation).

On `SIGTERM` (every deploy) the API stops both sweeps, ends open live-update streams, closes the `LISTEN` connection and the query pool, and exits — or exits anyway after ten seconds.

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
| Styling (web) | Tailwind CSS v4 | Design tokens as a `@theme` in `src/index.css`, redefined for dark mode; components style themselves with utilities, and shared shapes live in `src/components/ui`. See [CONTRIBUTING.md § Styling](CONTRIBUTING.md#styling-web) |
| Data fetching | TanStack Query | Server state management, caching, background refetch |
| Auth | Microsoft OAuth (domain-restricted) + email/password | Microsoft is what every U of T account already has; password sign-in covers local development and anyone who prefers it. Both are restricted to `@mail.utoronto.ca` / `@utoronto.ca` |
| Session | JWT via `@fastify/jwt` | Stateless; works across potential future services |
| File storage | Cloudflare R2 (S3-compatible) | Decoupled from compute; no egress fees; `@aws-sdk/client-s3` talks to it over the S3 API |
| AI discovery | OpenAI Responses API via `openai`, structured output validated with Zod | Turns a natural-language query into a closed set of filters; `api/src/lib/discovery.ts` falls back to keyword search with a warning if `OPENAI_API_KEY` is unset, so no route depends on an AI budget existing. Model defaults to `gpt-5.6-luna` and is overridable with `OPENAI_MODEL` |
| Email | Resend | Simple API, generous free tier; `api/src/lib/email.ts` no-ops with a warning if `RESEND_API_KEY` is unset rather than blocking anything |
| Tests | Vitest — `app.inject()` against a real Postgres for the API, Testing Library + jsdom for the web app | Same toolchain as Vite/TS, no extra config; the rules worth testing are Prisma queries, so a mocked database would test nothing real |
| CI | GitHub Actions | `typecheck` + API tests + web tests + `build` + `lint` on every PR (`.github/workflows/ci.yml`) |
| Hosting (API + database) | Render | Managed Postgres next to the API, so there's no separate database account or connection-pooling story at this size; deploys from the Dockerfile in `api/` |
| Hosting (web) | Cloudflare Pages | Static build, free, and already where R2 lives — the storage bucket and the site sit in one dashboard |

---

## Deployment

Three pieces, two platforms, both deploying from `main` on push. CI (`typecheck` → API and web tests → `build` → `lint`) is what gates a PR into `main`; neither platform runs the tests, so a red CI must not be merged.

| Piece | Where | How |
|---|---|---|
| API | Render web service (Docker) | Defined in `render.yaml` (a Blueprint): Dockerfile `api/Dockerfile`, build context the repo root, health check on `/health` |
| Database | Render Postgres | Also in `render.yaml`; `DATABASE_URL` is wired from it to the API, and nothing else references the credentials |
| Web | Cloudflare Pages | Root directory `web`; build command `cd .. && pnpm install --frozen-lockfile && pnpm --filter @uofthub/web build`; output directory `dist`. The root directory has to be `web` so Pages finds `web/functions` (link previews and the sitemap) |

**Migrations run at container boot**, not as a separate release step: the image's command is `prisma migrate deploy && node dist/index.js`, the same ordering the local `predev` script uses, so the server can never accept a request against a schema it doesn't match. A failed migration fails the health check, and Render keeps the previous instance serving.

**The API must live on a subdomain of the web domain** — `api.uofthub.com` alongside `uofthub.com`. The session cookie is `SameSite=Lax`, which browsers scope by registrable domain: a subdomain is same-site and the cookie rides along on every `credentials: 'include'` request, but an API on a different domain (an `*.onrender.com` URL, say) is cross-site and the browser drops it. Every authenticated request would 401 with nothing obviously wrong in the code. Point a custom domain at the Render service before treating auth as working.

Environment variables in production — see `api/.env.example` for the full list and shape:

- `DATABASE_URL` — wired from the Render Postgres by `render.yaml`.
- `JWT_SECRET` — required; `buildApp()` refuses to boot in production without it rather than silently signing forgeable sessions.
- `WEB_URL` — the site's origin. Drives both the CORS allowlist and the post-OAuth redirect, so a wrong value looks like "sign-in does nothing".
- `API_URL` — this API's own public base, used to build avatar URLs.
- `MICROSOFT_*` — the redirect URI must also be registered on the Azure app registration; they have to match exactly. `MICROSOFT_ALLOWED_TENANT_IDS` (U of T's directory id) is required: the `organizations` authority accepts any directory, and any directory can claim any address, so without it every Microsoft sign-in is refused in production (`src/lib/microsoftTenant.ts`).
- `STORAGE_*` — R2 bucket and token. The bucket stays private; nothing is served from a public bucket URL.
- `RESEND_API_KEY`, `EMAIL_FROM` — email no-ops with a warning when the key is unset, so a deploy without it degrades rather than breaks. `EMAIL_FROM` is on the `notifications.uofthub.com` subdomain, which needs its SPF, DKIM and DMARC records verified in Resend — see [Email deliverability](#email-deliverability).
- `OPENAI_API_KEY` — `/discover` falls back to keyword search without it, same as above. `OPENAI_MODEL` is optional and overrides the default model.

`PORT` is provided by Render and read by `src/index.ts`; the server binds `0.0.0.0`.

`TRUST_PROXY_HOPS` — how many proxies sit in front of the API; defaults to 1 in production (Render's), 0 otherwise. Without it every request appears to come from the proxy, and every IP-keyed rate limit — sign-in above all — becomes one budget for the whole site.

On Cloudflare Pages, set `VITE_API_URL` (the build reads it, and so do the Functions). `web/public/_headers` sets the Content-Security-Policy and the other response headers; the API sets its own in an `onSend` hook in `app.ts`.

**Link previews** — the app is a single page, so a shared link would otherwise show the site's generic title. `web/functions/projects/[id].js`, a Pages Function, fetches `GET /projects/:id/share` (public projects only) and writes the project's title, pitch and cover into the page's head; `web/functions/sitemap.xml.js` lists every public project from `GET /projects/sitemap`. Nothing else is server-rendered.

Each API instance holds one long-lived Postgres connection for [live updates](#live-updates) on top of Prisma's pool, and the `/events` streams are long-lived HTTP responses — nothing between the browser and Render may buffer them. It also means the API must run on a paid Render instance: free instances spin down when idle, which drops the live-update streams and stops the in-process maintenance sweep.

There are no scheduled jobs to deploy separately: the one sweep runs inside the API process (see [Scheduled jobs](#scheduled-jobs)).

---

## ADRs (Architecture Decision Records)

Significant decisions will be recorded as numbered ADRs in `docs/adr/`. ADR format: context → decision → consequences.
