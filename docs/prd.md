# PRD: uofthub

**Working name:** uofthub
**Domain:** uofthub.com (acquired)
**Author:** Renfred Alonge
**Status:** Draft v1

---

## 1. Summary

An open-source platform where University of Toronto students can create, showcase, and share what they build — course projects, research, startups, hackathon work, club projects, or personal side projects. It combines the practical utility of a file/link repository (like GitHub + Google Drive) with a lightweight social layer (profiles, follows, likes, discovery) so student work doesn't disappear into scattered Canvas pages, GitHub repos, and Discord servers.

It is explicitly **not**:
- An official U of T platform (at least initially)
- A learning management system (not a Canvas/Crowdmark competitor)
- A grading or submission tool
- A GitHub competitor

It **is**: a social layer for student-made work across the entire university, open to all faculties, not just CS.

---

## 2. Problem

Student work is currently scattered across GitHub, Google Drive, Discord, Canvas, personal websites, and random PDFs. There is no unified, discoverable, persistent home for what students build during their time at university — especially for non-CS students who don't naturally use GitHub. Work is often lost, forgotten, or invisible to peers, TAs, professors, and even the student's own future self.

---

## 3. Vision

> "An open-source home for everything students build at university."

Long-term, a student's presence on the platform becomes a living portfolio generated from their actual university experience — projects, collaborators, courses, and research — persisting after graduation (e.g. `renfred.students.utoronto.ca`).

---

## 4. Goals

- Give every U of T student (any faculty, not just CS) a place to publish and preserve their projects.
- Make student work discoverable by peers, TAs, and professors.
- Build a lightweight social graph around student projects (follow, like, comment, collaborate).
- Stay open-source and independent of official university infrastructure at first, while designing so U of T could later adopt/host it.
- Lay groundwork for an HCI/social-computing research angle (how students discover, share, and collaborate on peer-created work).

### Non-goals (for now)
- Official grading or submission workflows
- Scraping or integrating with Canvas/university systems automatically
- Requiring institutional endorsement to launch

---

## 5. Target Users

- **Students** (any faculty — CS, Engineering, Rotman, Architecture, Music, etc.) who want to showcase projects, research, or creative work.
- **Collaborators/teams** working on shared projects.
- **TAs/Professors** who may be invited to view specific projects (view-only, opt-in per project).

---

## 6. Core Concepts

### Project (the core social object)
Each project can include:
- Title + description
- Tags (course, faculty, topic)
- Files (docs, reports, designs)
- External links (GitHub, website, demo video)
- Collaborators
- Visibility setting: **Private / U of T only / Public**
- Likes, views, comments

### Profile
- Name, faculty, program, class year
- List of projects (auto-generated portfolio)
- Followers/following

### Access & Roles
- Project owner(s)/collaborators — full edit access
- Invited TA/Professor — view-only access per project (opt-in, not automatic)
- Visibility controls default to the most private setting; student explicitly opens it up

### Student Groups (Clubs & Labs)
Clubs and research labs get org pages (`/orgs/:slug`) distinct from individual profiles: created by moderators and verified from the start (no self-serve verification, no storage quotas — see [redesign.md](redesign.md#student-groups-and-quotas)), a "Built with" link from member projects, and the ability to publish lightweight "activities" (events, meetings, recaps) alongside member projects. Full spec: [student-groups.md](student-groups.md).

---

## 7. Feature Set

### MVP (Semester 1)
- **Auth:** U of T email verification, or Google/Microsoft OAuth
- **Profiles:** basic profile (name, faculty, program), list of a student's projects
- **Projects:**
  - Create/edit project
  - Description, tags, course/research association
  - Add collaborators
  - Add external links
  - File uploads
- **Discovery:**
  - Search projects
  - Browse by faculty/course
  - Trending/new projects feed
- **Social:**
  - Like
  - Follow (students and/or projects)
  - Comment

### Phase 2 (Semester 2+)
- Project versioning (v1 → v2 → v3)
- ~~Fork/remix~~ — removed; remixing is [not decided yet](not-decided-yet.md#remixing)
- Project analytics (views, engagement)
- Course pages, club pages, research lab pages
- TA/Professor invite-to-view workflow, formalized
- Notifications (in-app + email) for invite/request flows that are currently silent
- Trust & Safety: reporting/moderation for public projects, an admin role, a Terms of Service / IP-ownership page

### Phase 3 (Student groups & integrations)
Full spec: [student-groups.md](student-groups.md).
- Group verification workflow (pending → review → verified/denied/info-requested, 7-day auto-delete on timeout)
- Admin portal for reviewing group verification requests (shares the admin role built in Phase 2)
- ~~Per-term group storage quota (10GB/term, stacking, same manual-override process as individual accounts)~~ — removed in the redesign along with personal quotas
- Org activities — lightweight posts (meetings, events, recaps) on org pages
- Discord integration (link a group's server on its org page)

### Later / Exploratory
AI features are deliberately last — see [ROADMAP.md § Later / Exploratory](ROADMAP.md#later--exploratory).
- Collaborative editing (requires WebSocket infrastructure)
- AI-powered project discovery ("show me AI projects built by U of T students in the last year")
- GroupMe integration — same treatment as Discord, deferred until that ships
- Research study on discovery/collaboration/publishing behavior (privacy-preserving, aggregate data)
- Potential official U of T subdomain/hosting, once there's real traction
- Alumni-persistent portfolios

---

## 8. Domain & Positioning Strategy

- Do **not** build around getting a U of T-hosted domain (e.g. `students.utoronto.ca/~renfred/project`) from day one.
- Launch independently under the name **uofthub** at **uofthub.com** (already acquired).
- Position as: *"An open-source platform for U of T students to share what they build"* — not an official university platform.
- Once there's real usage (target: 50–100 active U of T students), approach U of T with a working product and traction, not just a pitch — a much stronger position for requesting infrastructure/domain support.
- Never imply university endorsement until it's actually granted.

---

## 9. Privacy, IP & Academic Integrity (Critical — design from Day 1)

Students may upload sensitive material: unpublished research, proprietary startup ideas, copyrighted course materials, personal information, or group work where not all teammates consented to publishing. Requirements:

- Explicit, student-controlled visibility per project: **Private / U of T / Public**, defaulting to the most restrictive.
- Clear consent flow when adding collaborators to a project (they should be able to approve/deny being listed).
- No automatic scraping of Canvas or other university systems.
- Clear terms around ownership/IP — the platform does not claim rights to uploaded work.
- TA/professor access is opt-in per project, never automatic or platform-wide.

---

## 10. Architecture (high-level)

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

Future graph extension: Students → Projects → People → Courses → Research → Clubs → University.

---

## 11. Success Metrics

- Number of active student accounts
- Number of published projects
- % of projects with more than one collaborator
- Follow/like/comment engagement rate
- Retention: students returning to add a second project
- (Stretch) Adoption across faculties beyond CS

---

## 12. Open Questions

- Exact auth method for verifying U of T student status (domain-restricted email vs. OAuth vs. manual verification)
- File storage/hosting approach and size limits
- Moderation policy for public projects — the mechanism (report → admin review → dismiss/takedown/warn) is now built, and the categories a project can be reported under are written down on `/terms`; what happens on *repeat* offenses is still undecided (there is no strike count, and a suspension has no implementation behind it yet)
- Whether/when to formalize the TA/professor access model
- Timeline and criteria for approaching U of T about infrastructure support
- What evidence counts as sufficient proof when verifying a student group's authorization (no official U of T club/lab registry API exists to check against) — see [student-groups.md](student-groups.md)
