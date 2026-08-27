# Roadmap

Based on [prd.md](prd.md). Items within each phase are not strictly ordered.

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
- [ ] File uploads

**Discovery**
- [x] Search projects
- [x] Browse by faculty / course
- [x] Trending / new projects feed

**Social**
- [x] Like a project
- [x] Comment on a project

---

## Phase 2 — Semester 2+

**Projects**
- [x] Project versioning (v1 → v2 → v3) — snapshot current state; version history panel on project page
- [x] Fork / remix ("Built from X's project") — fork button creates a private copy
- [ ] Collaborative editing

**Analytics**
- [x] Project view counts and engagement metrics (visible to owner) — daily view chart + totals panel

**Pages**
- [x] Course pages (aggregate all projects tagged to a course) — `/courses/:tag`
- [x] Club pages — `/orgs/:slug` with CLUB type
- [x] Research lab pages — `/orgs/:slug` with LAB type

**Access**
- [x] Formalized TA / professor invite-to-view workflow — faculty users can request VIEWER access; owner approves via collaborator panel

**Discovery**
- [x] AI-powered project discovery — natural language search via Claude (requires ANTHROPIC_API_KEY in .env)

---

## Phase 3 — Student groups & integrations

Full spec: [docs/student-groups.md](student-groups.md).

**Student groups**
- [ ] Group verification workflow — pending → review → verified/denied, 7-day auto-delete on timeout
- [ ] Admin portal for reviewing group verification requests
- [ ] Per-term group storage quota (10GB/term, stacking, same override process as individual accounts)
- [ ] Org activities — lightweight posts (meetings, events, recaps) on `/orgs/:slug` pages

**Integrations**
- [ ] Discord — link a group's server on its org page

---

## Later / Exploratory

- File uploads (requires object storage: S3 or compatible)
- Collaborative editing (requires WebSocket infrastructure)
- Alumni-persistent portfolios (profile persists post-graduation)
- Privacy-preserving, aggregate research study on discovery/collaboration behavior (HCI angle)
- Potential official U of T subdomain/hosting once there's real usage traction
- Mobile app
- GroupMe integration — same treatment as Discord, deferred until that ships

---

## Success metrics

- Active student accounts
- Published projects
- % of projects with 2+ collaborators
- Follow / like / comment engagement rate
- Retention: students who return to add a second project
- Stretch: adoption across faculties beyond CS
