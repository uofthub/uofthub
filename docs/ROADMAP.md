# Roadmap

Based on [prd.md](prd.md). Phases are ordered; items within a phase are not. Unchecked items are broken into implementation-level sub-tasks — schema change, endpoint, UI — so any one of them can be picked up and built without re-deriving the plan first. Checked items link to nothing further; they're done, not a summary of what's left.

---

## Phase 1 — MVP (Semester 1)

Goal: a working platform that a real U of T student can use to publish and share a project.

**Auth**
- [x] U of T email verification (Microsoft OAuth or email + password, both domain-restricted)

**Profiles**
- [x] Basic profile: name, faculty, program, class year
- [x] List of a student's projects (auto-generated portfolio)
- [x] Follow/unfollow students

**Projects**
- [x] Create and edit a project
- [x] Title, description, course/research association, tags (faculty, topic)
- [x] Visibility control: Private / U of T only / Public (default: Private)
- [x] Add collaborators (invite with accept/deny flow)
- [x] Add external links (GitHub, demo, website)
- [x] File uploads — policy in [ARCHITECTURE.md § File storage](ARCHITECTURE.md#file-storage).
  - [x] Pick an S3-compatible storage provider — Cloudflare R2
  - [x] `api/src/lib/storage.ts` — client wrapper: put/delete/signed-URL-for-download
  - [x] `POST /projects/:id/files` — allowlist + per-category size check against the actual bytes (magic-byte check via `file-type`/OLE2 signature/SVG sniff in `api/src/lib/fileValidation.ts`, not the client-declared extension or MIME type — verified by hand: a `.exe` renamed to `.pdf` is rejected, a genuine file of the declared type is not), writes a `ProjectFile` row
  - [x] `DELETE /projects/:id/files/:fileId` — owner only, matching the existing owner-only convention for links/collaborators (not "owner/collaborator" as this was originally scoped)
  - [x] ~~Per-account quota enforcement~~ (removed in the redesign) — summed live from `ProjectFile.sizeBytes` against the 2GB cap; per-project 20-file cap
  - [x] Rate-limit the upload route (`config: { rateLimit: {...} }`, same pattern as `auth.ts`)
  - [x] Upload UI on `ProjectPage.tsx` — file input + list + owner-only delete. Not on `CreateProjectPage.tsx`: a file needs a real project id to attach to, so upload only becomes available once the project exists, same as invites and links today
  - [x] File list + download/delete actions on `ProjectPage.tsx` — downloads go through `GET .../files/:fileId/download`, which re-checks visibility and redirects to a signed URL, never a public bucket URL
  - [x] `api.ts` client methods for upload/delete
  - [x] Reuse the same storage client for avatar images — `POST /users/me/avatar` (upload), `DELETE /users/me/avatar` (remove), `GET /users/:id/avatar` (public signed-URL redirect, inline disposition so it renders in an `<img>` rather than downloading). Microsoft sign-in also syncs the account's Graph photo as the avatar, but only on a brand-new signup, and only if the student hasn't already set their own (`User.avatarIsCustom`) — a manual upload always wins

**Discovery**
- [x] Search projects
- [x] Browse by faculty / course
- [x] Trending / new projects feed

**Social**
- [x] Like a project
- [x] Comment on a project

---

## Phase 2 — Semester 2+

Goal: depth for the projects that already exist, and a home for the groups behind them.

**Projects**
- [x] Project versioning (v1 → v2 → v3) — snapshot current state; version history panel on project page
- [x] Fork / remix ("Built from X's project") — fork button creates a private copy

**Analytics**
- [x] Project view counts and engagement metrics (visible to owner) — daily view chart + totals panel

**Pages**
- [x] Course pages (aggregate all projects tagged to a course) — `/courses/:tag`, now a redirect to Explore's course filter (`/explore?course=`)
- [x] Club pages — `/orgs/:slug` with CLUB type
- [x] Research lab pages — `/orgs/:slug` with LAB type

**Access**
- [x] Formalized TA / professor invite-to-view workflow — faculty users can request VIEWER access; owner approves via collaborator panel

**Notifications**
- [x] Pick an email transport — Resend, wrapped in `api/src/lib/email.ts`. No caller yet: it exists so Phase 3's org-verification emails aren't blocked on the decision. Sending no-ops with a warning when `RESEND_API_KEY` is unset, so local dev needs no account
- [x] Schema — `Notification` model (`userId`, `type`, `payload`, `read`, `createdAt`) for an in-app feed. `payload` is JSON holding denormalized display data (project title, actor name) captured at creation, so the feed still reads correctly after the source row changes or is deleted
- [x] Backend — emit at each previously-silent trigger via `lib/notifications.ts`: collaborator invited, invite accepted/declined, TA/professor access requested, and access request approved/denied (denial is the `DELETE .../collaborators/:userId` path, not a PATCH)
- [x] `GET /users/me/notifications` (returns `unreadCount` alongside the list), `POST /users/me/notifications/:id/read`, plus `POST .../read-all` for the bell's open-to-clear behaviour
- [x] `PATCH /projects/:id/collaborators/:userId` extended — previously only the invitee could respond about themselves, so the owner had no way to approve a TA/professor access request that `POST /request-access` had created. The owner may now decide a pending `VIEWER` row; everything else is still self-only
- [x] Frontend — notification bell + dropdown in the header (`components/shell/NotificationBell.tsx`) with an unread dot, polling every 30s (no WebSocket infrastructure — deliberately deferred, see Later / Exploratory). Opening it marks everything read but keeps the just-seen items highlighted, so the feed doesn't grey out the moment you look at it
- [x] Frontend — accept/decline lives *in the notification row*, not on the project page: a pending collaborator can't open a `PRIVATE` project yet, so a link there would 404 until they accept
- [x] Frontend — owner-only "Access requests" panel on `ProjectPage.tsx` with approve/deny. The `GET /projects/:id/access-requests` endpoint already existed but nothing rendered it, so requests were invisible to the owner in the UI
- [x] Phase 3's org-verification emails — `lib/orgEmails.ts`; `emailAdminsOfSubmission` on `POST /orgs/:slug/verify`, `emailContactOfDecision` on all three admin decisions. Best-effort: `sendEmail` no-ops without `RESEND_API_KEY`, so a missing key degrades rather than failing the request
- [ ] No notification is emailed yet — the in-app feed is the only delivery channel. Worth revisiting once there's real usage, since an invite is exactly the kind of thing a student won't see until their next visit

**Trust & Safety**
"Moderation policy for public projects" was an open question from prd.md's first draft ([prd.md § 12](prd.md#12-open-questions)) until the report → review → decision mechanism below shipped. What counts as a violation, and what happens on repeat offenses, is still a policy question rather than a code one.
- [x] Schema — `Report` model (`reporterId`, `projectId`, `reason`, `status`, `createdAt`), plus `details` (the reporter's free text, capped at 1000 chars — the reason enum sorts the queue, this is what a moderator actually reads) and `reviewedAt`/`reviewedById`/`reviewNote`
- [x] `POST /projects/:id/report` — any authenticated user, rate-limited to 5/hour and **keyed by session cookie, not IP** (the rate limiter's default): most of campus shares a handful of NAT addresses, so an IP budget would let one abuser mute everyone on the same wifi. Rejects reporting your own project, a `PRIVATE` one (nobody outside it can see it), and a second open report on a project you have already reported
- [x] Admin flag/role on `User` — `isAdmin`, checked against the database on every admin request (`lib/admin.ts`) rather than carried in the JWT: sessions last 7 days, so a token minted while the flag was set would otherwise outlive its revocation. Granted only by `pnpm --filter @uofthub/api grant-admin <email>`, never through the API. This is the shared foundation Phase 3's org-verification admin portal also needs
- [x] `GET /admin/reports`, `POST /admin/reports/:id/decision` (dismiss / take down / warn owner). Take-down forces the project back to `PRIVATE` and stamps `Project.takenDownAt`, which `PATCH /projects/:id` then refuses to let the owner re-open and `POST /projects/:id/fork` refuses to copy — without those two guards the decision is one click away from being undone. Nothing is deleted: the owner keeps the project, its files and its history. A take-down also closes every other open report on the same project, so a much-reported project notifies its owner once rather than once per report
- [x] Frontend — "Report" action on `uoft`/`public`-visibility projects (a dialog with the reason list + free text); `/admin` review queue, oldest-first, with the three decisions and a note field. The nav entry only appears for `isAdmin` accounts; the API gate is the real one
- [x] Frontend — take-down banner on `ProjectPage.tsx`, since the owner is the only person who can still load the project, and `PROJECT_MODERATED` notifications for warn/take-down (a dismissal notifies nobody — the owner never learns a dismissed report existed)
- [x] A real Terms of Service / IP-ownership page — `/terms`, linked from the Resources nav section. Covers what [prd.md § 9](prd.md#9-privacy-ip--academic-integrity-critical--design-from-day-1) requires ("clear terms around ownership/IP"), the visibility guarantees, what you may not publish, and how the report → review → decision flow above actually works

---

## Phase 3 — Student groups & integrations

Goal: a group page stops being "anyone can claim it" and becomes something verified, funded per term, and worth checking regularly. Full spec: [student-groups.md](student-groups.md).

> **Revised in the redesign.** The verification workflow and per-term storage quota below shipped and were then removed as more machinery than the feature earned: groups are now created by moderators, already verified, and there are no storage quotas. See [redesign.md § Student groups and quotas](redesign.md#student-groups-and-quotas). The entries are kept as history.

**Simplified groups (redesign)**
- [x] `POST /orgs` is moderator-only and creates the group `VERIFIED`; optional `execEmail` hands admin to the exec
- [x] Removed `POST /orgs/:slug/verify`, the 7-day deadline, `sweep-orgs` and `.github/workflows/scheduled.yml`; admin decisions are `APPROVE`/`DENY` for legacy groups
- [x] "Built with" — owners link a project to a group they belong to; cards show verified groups; group admins can unlink with `DELETE /orgs/:slug/projects/:projectId`
- [x] Removed personal and group storage quotas, `lib/terms.ts` and `grant-term-storage`; per-file size and 20-file caps remain
- [ ] Drop the dormant `OrgStorageGrant`, `ProjectFile.orgId` and verification columns once the decision has held
- [ ] Revisit storage limits against real usage

**Verification workflow**
- [x] Schema — `status` enum (`PENDING_VERIFICATION` / `IN_REVIEW` / `INFO_REQUESTED` / `VERIFIED`), `verificationDeadline`, `verificationNote`, `verifiedAt` on `Organization`. The single `contactInfo` field this was scoped with became **`contactEmail` + `contactRole`**: a decision email needs a real address, and the claimed role is what an admin weighs the claim against — one freeform column would have made both unusable. `verificationNote` holds the group's submission; a separate `reviewNote` holds the admin's reply, since the two are written by different people and both need to survive a round trip
- [x] `POST /orgs` — requires contact email + claimed role, sets `PENDING_VERIFICATION` and a 7-day deadline instead of publishing immediately
- [x] Gate `GET /orgs` and `GET /orgs/:slug` — only `VERIFIED` groups are visible to anyone but the group's **members** (scoped as "the creator", but membership is the same set at creation and the wider rule is the one the data model can actually express). `GET /orgs` still returns the caller's own unverified groups, listed separately on the page: hiding them from their own members would leave nobody a route back to the page they have 7 days to verify. Contact details, the submission and the reviewer's note are stripped for non-members even on a verified page
- [x] `POST /orgs/:slug/verify` — an org admin submits material; moves to `IN_REVIEW`, clears the deadline (the clock was on the group, and review has no deadline on them), emails the admin team. Refuses a deadline that has already passed rather than trusting the sweep to have run
- [x] Scheduled sweep (cron) — `pnpm --filter @uofthub/api sweep-orgs` (`--dry` to list only). Deliberately a script rather than an in-process timer: a cron entry is one line of config and can't double-fire across replicas
- [x] Email notifications — `lib/orgEmails.ts`: admin alert on submission (to every `isAdmin` account, so there's no separate admin address to keep in sync), contact notified on approve / request-info / deny. First real caller of `lib/email.ts`
- [x] Frontend — creation form collects contact + role and explains the 7-day window; members see a status banner with a day countdown, the reviewer's note, and the submit button on their own unverified group
- [x] Frontend — verification submission form, pre-filled with the previous submission when re-submitting after a request for more info

**Admin portal**
- [x] Reuses the admin flag/role added in Phase 2 § Trust & Safety — `User.isAdmin` and the `requireAdmin` preHandler in `lib/admin.ts` now exist; org verification just needs to register its routes behind the same gate
- [x] `GET /admin/orgs?status=IN_REVIEW` — list pending requests, admin-only, oldest first
- [x] `POST /admin/orgs/:slug/decision` — approve / deny / request-info. Approve also grants the current term's storage immediately, so a group approved mid-term can actually upload; request-info opens a fresh 7-day window; deny deletes the group and its data, per [student-groups.md](student-groups.md)
- [x] Frontend — the `/admin` page gained a "Group verification" section alongside project reports, with the submitted evidence inline and the three decision actions. Deny takes two clicks, since it deletes

**Per-term storage quota**
- [x] Blocked on Phase 1's File uploads shipping first — this reuses that upload endpoint, keyed to the org instead of the user
- [x] Schema — `OrgStorageGrant` ledger, one row per (org, term). A ledger rather than a computed total because the stacking rule is "every term since verification", which needs a record of what was actually granted, not a multiplication
- [x] `lib/terms.ts` defines the term calendar (Fall/Winter/Summer, UTC, key like `2026F`); `pnpm --filter @uofthub/api grant-term-storage` grants every term a verified group is owed but hasn't been given. Idempotent on (org, term), so it can run at any cadence and a group that went ungranted for two terms is caught up in one run
- [x] Enforce group quota on the upload endpoint when the project is linked to a `VERIFIED` group the uploader belongs to; the chosen group is stamped on `ProjectFile.orgId` at upload time so quota already spent can't move between accounts when org links change later. A project linked to several groups bills the one it was linked to first. An **unverified** group has no allowance, so its files fall back to the uploader's personal 2GB rather than being blocked outright — the individual policy is explicitly unchanged by group membership

**Org activities**
- [x] Schema — `OrgActivity` (title, description, date, link, imageUrl, orgId, createdById)
- [x] `POST` / `GET` / `DELETE /orgs/:slug/activities` — any member can post; the author or an org admin can delete
- [x] Frontend — activity feed section on `OrgPage.tsx` with a create form for members. The image is a URL rather than an upload: an upload would have to bill someone's quota, and an activity is a lightweight post — that's a deliberate line, not an omission

**Integrations**
- [x] Discord — `discordUrl` on `Organization`, set at creation or via `PATCH /orgs/:slug` (admins only — without the PATCH, groups verified before this shipped could never add one), with a badge on `OrgPage.tsx`. Validation is **stricter** than `safeExternalUrl`: the link sits behind a Discord badge, so it is restricted to discord.gg / discord.com hosts rather than any http(s) URL

---

## Phase 4 — Density, feed and feedback

Goal: make the site worth opening a second time. Not scoped from [prd.md](prd.md) — it came out of using what Phases 1–3 built and finding two things wrong with it: everything was shown as a wall of small cards, which is unreadable at any real volume, and publishing a project produced no observable consequence for anybody. Full rationale: [feed-and-density.md](feed-and-density.md).

**Density**
- [x] `/projects` (now `/explore`) defaults to the **list**, not the card grid. A card grid only earns its vertical space when the cover image is what you are choosing by, and most projects here have never had a file uploaded — `ProjectCard`'s own comment already said so, which meant every tile spent 124px drawing a coloured letter of the alphabet. A list also *ranks*, which a grid cannot: row one is unambiguously first, where twelve tiles all read as equally important. The grid is still one click away and the choice is remembered per browser
- [x] List mode narrows the page to a 920px reading column, header and filters included — a 76px thumbnail and a 14px description stretched across a 1600px monitor is its own kind of unreadable. Grid mode keeps full width
- [x] `/courses/:tag` and `/discover` use the list too: they are the same directory filtered differently, and `/discover` is a *ranked* result set where a grid says nothing about which answer came first
- [x] Schema — `Project.pinnedAt`; `POST /projects/:id/pin` (owner only, capped at six with an error that says how to make room), `GET /users/:id/pinned`. Its own endpoint rather than a flag on the paged list, since the list is newest-first and a project pinned a year ago would not be on page one
- [x] Frontend — a profile leads with its pinned projects **as cards**, and renders everything else as a list with Show more. The pinned strip is the one place a card grid is right, for exactly the reason it is wrong everywhere else: a small, deliberately chosen set where the visual weight *is* the message. The pin control lives on the project page, not the profile — a profile row is a whole anchor, and a button inside one is invalid markup that silently breaks the row's click target

**Home feed**
- [x] Schema — `Project.publishedAt`, stamped once by `lib/publishing.ts` at the transition out of `PRIVATE`, from both `POST /projects` and the `PATCH` that opens a draft up. The feed orders by it rather than `createdAt`: a capstone drafted in January and opened up in March belongs in March. Idempotent, so `UOFT → PRIVATE → UOFT` is not a second publication; the migration backfills it for everything already visible so the feed is not empty on day one
- [x] `GET /feed` — projects from people you follow, from courses you have published in, and from your campus, ordered by publish time, with a trending top-up once that runs out so a brand-new account does not land on an empty page. Each row carries the **reason** it reached you, assigned strongest-first; a top-up row is labelled `TRENDING` even when it also happens to be from your campus, since saying otherwise would make the feed look better connected than it is. Nothing in it is manufactured activity — every row is a real project that was really published
- [x] `GET /feed/activity` — this week's views against last week's, plus likes, comments and reactions on your own work (excluding your own), and recent comments with names and text. A view counter that only moves when you reload your own page is exactly the "nobody interacts with it" feeling; a name and a sentence is not. Only rendered to students who have published something
- [x] Frontend — `/` is a feed to a student and the marketing page to a visitor (since split: the feed lives at `/feed` and `/` sends a signed-in student there; `AppShell.tsx` picks the chrome). Previously somebody who had been publishing here for a month still landed on "Get started" and a product screenshot every visit

**Social notifications**
- [x] Six new `NotificationType`s — `PROJECT_LIKED`, `PROJECT_COMMENTED`, `PROJECT_FORKED`, `PROJECT_REACTED`, `FOLLOWED_YOU`, `FOLLOWING_PUBLISHED`. Every previous type was administrative, so a like or a comment was only ever discoverable by reopening the project and reading a counter, and following somebody was a button that did nothing observable
- [x] Schema — `Notification.key`, holding the identity of what is being announced (`like:<projectId>:<actorId>`). `notifyOnce` in `lib/notifications.ts` fires only the first time, because un-liking and re-liking a project twenty times must not be twenty pings. Comments and forks stay unkeyed — each one is genuinely new. A reaction is keyed per person per project rather than per kind: somebody tapping all four chips is one piece of feedback
- [x] `notifyMany` caps the follower fan-out at 500 — the one notification that scales with somebody else's popularity rather than their own actions. The publish still succeeds and the feed still shows it to every follower; only the bell stops short
- [x] Frontend — the comment excerpt (capped at 140 chars) rides along in the payload, so the bell says what was actually said rather than "somebody commented", and links straight to `?tab=comments` instead of the overview tab the comment is hidden behind. The message copy moved to `lib/notifications.ts` on the web side so it can be tested without mounting React

**Feedback**
- [x] Schema — `ProjectReaction` and `ReactionKind` (`USEFUL` / `IMPRESSIVE` / `WELL_DOCUMENTED` / `WOULD_USE`); `GET` and `POST /projects/:id/reactions`. One row per kind rather than flags on one row, so a project can be both useful and well documented without the answers overwriting each other
- [x] Frontend — a reaction row under the Like button, read back as a sentence ("4 found this useful · 2 found it well documented") rather than counts beside labels. Deliberately **not** a second Like and **not** a rating: Like stays the headline counted action, there is no negative reaction, and the point is that a blank comment box on a stranger's capstone collects nothing forever while one tap still says something the owner can use
- [x] `GET /projects/:id/analytics` extended — this week's views against last week's, the reaction tally, and `recentLikes` **with names**. Views stay anonymous and `ProjectDailyView` still has no `userId`; a like is already attributed on the project page, so showing the owner who liked their work reveals nothing new

---

## Later / Exploratory

Deliberately last — these either need infrastructure the earlier phases don't (WebSockets, an LLM budget) or are speculative enough that building them now would mean designing against guesses instead of real usage. The two with clear specs and cleared prerequisites are now built; what remains below is genuinely gated on something other than engineering time.

- [x] **AI-powered project discovery** — `GET /discover?q=`, natural-language search via an LLM (OpenAI, `gpt-5.6-luna` by default), and the `/discover` page behind it. The model never sees the database and never writes a query: it fills a closed set of fields (`search`, `faculty`, `campus`, `tag`, `sort`, `within`) validated by a Zod schema, which the route then applies through the same `visibleProjectWhere` filter every other read uses. Its output is untrusted input, and the schema is what keeps a creative answer from becoming a creative query
  - Without `OPENAI_API_KEY` the route degrades to a plain keyword search and says so in the response (`interpreted: false`) rather than 503ing — same pattern as `lib/email.ts`, so local dev and a deploy with no AI budget both keep working
  - Cost control: authenticated only, 20 searches/hour keyed by session (`lib/rateLimit.ts`, shared with the report route), query capped at 300 chars, `effort: 'low'`
  - The interpreted filters come back to the client and render as chips, so an empty result is explainable ("faculty Engineering") instead of looking broken
- [x] **GroupMe integration** — `groupMeUrl` on `Organization`, host-restricted to groupme.com the same way `discordUrl` is, with a badge on `OrgPage.tsx`. Its stated gate was "deferred until Discord ships", and Discord shipped in Phase 3
- Collaborative editing (requires WebSocket infrastructure) — still unbuilt, and still needs a decision before it needs code: *what* is co-edited. A project description is a text field, not a document, so there is no obvious surface for it yet
- Alumni-persistent portfolios (profile persists post-graduation) — nothing to build until there's a signal that someone has graduated; sign-in only proves the address still resolves
- Privacy-preserving, aggregate research study on discovery/collaboration behavior (HCI angle)
- Potential official U of T subdomain/hosting once there's real usage traction
- Mobile app

---

## Engineering foundations

Not phase-scoped — these are gaps in build/ship confidence rather than user-facing features, and belong alongside whichever phase is currently active rather than after it.

- [x] Tests — Vitest, `pnpm --filter @uofthub/api test` and `pnpm --filter @uofthub/web test`. API: 29 files covering the routes that carry real logic (fork, versioning, visibility filtering and show-from dates, project content, references, outputs, moderation decisions, the feed and its reasons, social-notification deduplication, pinning, reactions) plus the pure rules they lean on (`visibility.ts`, `projectContent.ts`, `references.ts`, `search.ts`, `url.ts`). Web: 19 files on the pieces with logic rather than layout — the project card, markdown rendering, file-type inference, notification copy, the reactions bar, the editor's draft/compose/save rules, sections, outputs and thumbnails. Route tests go through `app.inject()` against a **real Postgres**, not a mock — the rules being tested are Prisma queries, and a mock would only prove the query builder was called. The suite creates and migrates its own database, whose name must end in `_test`, so a stray `DATABASE_URL` can't point the truncate-between-tests at development data
- [x] CI — `.github/workflows/ci.yml` runs install, `prisma generate`, `typecheck`, the API tests (against a Postgres service container), the web tests, `build` and `lint` on every PR and every push to `main`
- [ ] Error monitoring — Clueline was wired into both halves and has been removed for now; errors go to the API's logs only. See [ARCHITECTURE.md § Error monitoring](ARCHITECTURE.md#error-monitoring)
- [x] Legal pages — `/terms` (ownership, acceptable use, moderation) and `/privacy` (what is collected, and every third party that sees any of it). The privacy page's third-party list mirrors the real integrations; adding another one means editing that page in the same commit
- [x] Deployment/hosting — **Railway** for the API and Postgres, **Cloudflare Pages** for the web build, recorded in [ARCHITECTURE.md § Stack decisions](ARCHITECTURE.md#stack-decisions) with the setup in [§ Deployment](ARCHITECTURE.md#deployment). `api/Dockerfile` + `railway.json` build the API and apply migrations at boot; `web/public/_redirects` gives Pages the SPA fallback React Router needs. Nothing is deployed yet — the config exists and the image is verified to build and boot, but the accounts, domains and cron jobs still have to be set up by hand

---

## Success metrics

- Active student accounts
- Published projects
- % of projects with 2+ collaborators
- Follow / like / comment engagement rate
- Retention: students who return to add a second project
- Stretch: adoption across faculties beyond CS

## Redesign (see docs/redesign.md)

- [x] UI rebuilt from Design.html — design system, all seven boards, dark mode, ⌘K command panel
- [x] Likes folded into reactions; reactions are Impressive / Want to collab / Learned something
- [x] Private saves, with a Saved page and profile tab
- [x] Project `pitch`, `type`, `status`; Unlisted visibility; update notes on versions
- [x] Unique daily views, private to the owner; trending ranked on the last seven days
- [x] One card shape for every list (reactions, links, collaborators, saved state)
- [x] Feed tabs server-side; fixed faculty list; facets counts; weekly spotlight; upcoming events
- [x] Threaded comments with Helpful votes
- [x] Collections — anyone can read, each reader sees only what they could already see; only listed projects can be added
- [x] Follow a project's updates — private, notifies on a version with a note, owner sees a count in Insights
- [x] Messages — one-to-one, text only, with an opt-out that still allows replies
- [x] Courses a student takes — shape the home feed like their own course tags
- [x] Import a project from a link — GitHub via its API, any page via its own metadata, guarded against reaching private addresses
- [x] "Open to" and personal links on profiles — GitHub and LinkedIn links must point at those sites
- [x] Messages: block and report a conversation — blocking closes it both ways without telling the blocked person; a report files the last 30 messages, blocks by default, and a moderator can warn or suspend the sender's messaging
- [x] Feed at its own address — `/feed` for a signed-in student, `/` stays the landing page; the header keeps search and the student's own things, and navigation lives in the feed's left rail, the account menu and the phone's bottom bar
- [x] Styling moved to Tailwind CSS v4 — tokens as a `@theme` in `index.css`, no per-component stylesheets
- [ ] Messages and notifications: push instead of polling

## Structured projects (see docs/structured-projects.md)

- [x] Show-from date — a project stays hidden from everyone but its makers until then
- [x] Optional sections and short details, with anything empty left out of the page
- [x] References — what a project drew on, and which other projects used the same thing
- [x] Outputs — what a project produced, with the primary one as its image everywhere
- [x] Filed under a real course (`courseCode`), with course templates, and every maker's faculty credited
- [x] One page to make and edit a project, publishing last

