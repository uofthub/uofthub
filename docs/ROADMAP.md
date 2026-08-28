# Roadmap

Based on [prd.md](prd.md). Phases are ordered; items within a phase are not. Unchecked items are broken into implementation-level sub-tasks — schema change, endpoint, UI — so any one of them can be picked up and built without re-deriving the plan first. Checked items link to nothing further; they're done, not a summary of what's left.

---

## Phase 1 — MVP (Semester 1)

Goal: a working platform that a real U of T student can use to publish and share a project.

**Auth**
- [x] U of T email verification (Google/Microsoft OAuth, domain-restricted)

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
- [ ] File uploads — policy in [ARCHITECTURE.md § File storage](ARCHITECTURE.md#file-storage). Provider picked and the core project-file path is built; avatar upload is the one piece still open.
  - [x] Pick an S3-compatible storage provider — Cloudflare R2
  - [x] `apps/api/src/lib/storage.ts` — client wrapper: put/delete/signed-URL-for-download
  - [x] `POST /projects/:id/files` — allowlist + per-category size check against the actual bytes (magic-byte check via `file-type`/OLE2 signature/SVG sniff in `apps/api/src/lib/fileValidation.ts`, not the client-declared extension or MIME type — verified by hand: a `.exe` renamed to `.pdf` is rejected, a genuine file of the declared type is not), writes a `ProjectFile` row
  - [x] `DELETE /projects/:id/files/:fileId` — owner only, matching the existing owner-only convention for links/collaborators (not "owner/collaborator" as this was originally scoped)
  - [x] Per-account quota enforcement — summed live from `ProjectFile.sizeBytes` against the 2GB cap; per-project 20-file cap
  - [x] Rate-limit the upload route (`config: { rateLimit: {...} }`, same pattern as `auth.ts`)
  - [x] Upload UI on `ProjectPage.tsx` — file input + list + owner-only delete. Not on `CreateProjectPage.tsx`: a file needs a real project id to attach to, so upload only becomes available once the project exists, same as invites and links today
  - [x] File list + download/delete actions on `ProjectPage.tsx` — downloads go through `GET .../files/:fileId/download`, which re-checks visibility and redirects to a signed URL, never a public bucket URL
  - [x] `api.ts` client methods for upload/delete
  - [ ] Reuse the same storage client for avatar images — `avatarUrl` is still just a plain string field on `User`, set by pasting a URL (`PATCH /users/:id` in `users.ts`); no actual upload path exists for it yet

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
- [x] Course pages (aggregate all projects tagged to a course) — `/courses/:tag`
- [x] Club pages — `/orgs/:slug` with CLUB type
- [x] Research lab pages — `/orgs/:slug` with LAB type

**Access**
- [x] Formalized TA / professor invite-to-view workflow — faculty users can request VIEWER access; owner approves via collaborator panel

**Notifications**
Every invite/request flow that exists today is pull-only — a collaborator finds out they were invited, or an owner finds out someone requested access, only by opening the right panel and looking. There's no `Notification` model and no email transport anywhere in the codebase (`grep -ri "nodemailer\|sendgrid\|resend\|smtp"` across `apps/api` returns nothing).
- [ ] Pick an email transport (Resend, Postmark, SES — none chosen yet)
- [ ] Schema — `Notification` model (`userId`, `type`, `payload`, `read`, `createdAt`) for an in-app feed
- [ ] Backend — emit at each existing silent trigger: collaborator invited, invite accepted/declined (`projects.ts` collaborator routes), TA/professor access requested and approved (`projects.ts` access-request routes)
- [ ] `GET /users/me/notifications`, `POST /users/me/notifications/:id/read`
- [ ] Frontend — notification bell + dropdown in `AppBar.tsx`, unread badge
- [ ] Phase 3's org-verification emails (admin alert on submission, contact notified on decision) reuse this same transport once it exists — that work is currently unblocked-looking in Phase 3 but actually depends on this shipping first

**Trust & Safety**
"Moderation policy for public projects" has been an open question since prd.md's first draft ([prd.md § 12](prd.md#12-open-questions)) and has no design or code behind it yet — anyone can currently publish a `public` project with no reporting path.
- [ ] Schema — `Report` model (`reporterId`, `projectId`, `reason`, `status`, `createdAt`)
- [ ] `POST /projects/:id/report` — any authenticated user, rate-limited
- [ ] Admin flag/role on `User` — doesn't exist yet anywhere in the codebase; this is the shared foundation Phase 3's org-verification admin portal also needs, so it only needs building once
- [ ] `GET /admin/reports`, `POST /admin/reports/:id/decision` (dismiss / take down / warn owner)
- [ ] Frontend — "Report" action on `uoft`/`public`-visibility projects; admin review page
- [ ] A real Terms of Service / IP-ownership page — [prd.md § 9](prd.md#9-privacy-ip--academic-integrity-critical--design-from-day-1) requires "clear terms around ownership/IP" and nothing covers this yet (`AboutPage.tsx` doesn't touch it)

---

## Phase 3 — Student groups & integrations

Goal: a group page stops being "anyone can claim it" and becomes something verified, funded per term, and worth checking regularly. Full spec: [student-groups.md](student-groups.md). Today `orgs.ts` only has `GET /orgs` (list), `POST /orgs` (create + immediate publish), and member/project listing — none of the below exists yet.

**Verification workflow**
- [ ] Schema — add `status` enum (`PENDING_VERIFICATION` / `IN_REVIEW` / `INFO_REQUESTED` / `VERIFIED`), `contactInfo`, `verificationDeadline`, `verificationNote` to `Organization`
- [ ] `POST /orgs` — require contact info + claimed role at creation; set `status: PENDING_VERIFICATION` and a 7-day `verificationDeadline` instead of publishing immediately
- [ ] Gate `GET /orgs` and `GET /orgs/:slug` — only `VERIFIED` groups are visible to anyone but the creator
- [ ] `POST /orgs/:slug/verify` — creator submits verification material; moves `status` to `IN_REVIEW`, clears the deadline, emails the admin team
- [ ] Scheduled sweep (cron) — auto-delete any group still `PENDING_VERIFICATION` or `INFO_REQUESTED` past its `verificationDeadline`
- [ ] Email notifications — admin alert on submission; contact notified on approve / deny / request-info. Depends on the email transport picked in Phase 2 § Notifications
- [ ] Frontend — creation form collects contact + role; creator sees a persistent "verify within 7 days" banner with countdown on their own unverified group
- [ ] Frontend — verification submission form

**Admin portal**
- [ ] Reuses the admin flag/role added in Phase 2 § Trust & Safety — build that once, use it for both org verification and project moderation
- [ ] `GET /admin/orgs?status=IN_REVIEW` — list pending requests, admin-only
- [ ] `POST /admin/orgs/:slug/decision` — approve / deny / request-info
- [ ] Frontend — new admin-only page listing pending groups with the three decision actions

**Per-term storage quota**
- [ ] Blocked on Phase 1's File uploads shipping first — this reuses that upload endpoint, keyed to the org instead of the user
- [ ] Schema — per-term allowance ledger (or computed total) on `Organization`
- [ ] Define academic term boundaries (config, not user-facing) and a job that grants the fresh 10GB allowance each term, stacking on prior terms
- [ ] Enforce group quota on the upload endpoint when the target is org-owned; only `VERIFIED` groups are eligible

**Org activities**
- [ ] Schema — new `OrgActivity` model (title, description, date, link, image, orgId)
- [ ] `POST` / `GET` / `DELETE /orgs/:slug/activities`
- [ ] Frontend — activity feed section on `OrgPage.tsx`, create-activity form for org admins/members

**Integrations**
- [ ] Discord — `discordUrl` field on `Organization` (same pattern as the existing `websiteUrl`, reusing `safeExternalUrl` for validation); link/badge on `OrgPage.tsx`

---

## Later / Exploratory

Deliberately last — these either need infrastructure the earlier phases don't (WebSockets, an LLM budget) or are speculative enough that building them now would mean designing against guesses instead of real usage.

- Collaborative editing (requires WebSocket infrastructure)
- AI-powered project discovery — natural language search via Claude. Was implemented (`/discover`, `ANTHROPIC_API_KEY`) and then pulled back out of the codebase to keep AI work scoped to this phase; spec preserved in [prd.md § 7](prd.md#7-feature-set) for whenever this phase starts
- GroupMe integration — same treatment as Discord, deferred until that ships
- Alumni-persistent portfolios (profile persists post-graduation)
- Privacy-preserving, aggregate research study on discovery/collaboration behavior (HCI angle)
- Potential official U of T subdomain/hosting once there's real usage traction
- Mobile app

---

## Engineering foundations

Not phase-scoped — these are gaps in build/ship confidence rather than user-facing features, and belong alongside whichever phase is currently active rather than after it.

- [ ] No tests exist anywhere in the repo (`find apps -iname "*.test.*" -o -iname "*.spec.*"` returns nothing) — pick a runner (Vitest fits the existing Vite/TS stack cleanly) and start with the routes that carry real logic: fork, versioning, visibility filtering
- [ ] No CI — add a GitHub Actions workflow running `typecheck` and `build` for both `apps/api` and `apps/web` on every PR; there's currently nothing gating what merges into `main`
- [ ] No deployment/hosting decision recorded — [ARCHITECTURE.md § Stack decisions](ARCHITECTURE.md) has no row for where any of this actually runs in production

---

## Success metrics

- Active student accounts
- Published projects
- % of projects with 2+ collaborators
- Follow / like / comment engagement rate
- Retention: students who return to add a second project
- Stretch: adoption across faculties beyond CS
