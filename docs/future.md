# Future

Features that have been discussed but not committed to, and features taken out for now to come back to later. Nothing here is on the roadmap until the open questions are answered; when one is decided, it moves to [ROADMAP.md](ROADMAP.md) and out of this file.

---

## Remixing

**Status:** not decided. Fork was built and then removed before launch (migration `20260929050000_remove_fork`).

### Why fork was removed

Fork gave any signed-in user a private copy of any project they could see — public or link-only — with the full write-up, sections, details, links and references, owned by them. The owner couldn't turn it off. The only credit was a "Forked from another project" line on the copy's page that didn't name the author and didn't show on cards, in the feed or on profiles, and the "(fork)" suffix on the title could be deleted.

On a U of T platform with course templates, that made presenting someone else's work — coursework above all — a one-click action. Copy-and-paste was always possible, but fork made it effortless and polished. Collaborator invites and the "Want to collab" reaction already cover working on something together.

### What remixing would have to be

If it comes back, it is a different feature, not fork restored:

- **Opt-in by the owner.** An "Allow remixes" setting, off by default.
- **Never for course projects.** Anything filed under a course code can't be remixed, whatever the setting.
- **Permanent attribution.** The copy says "Built on _Title_ by _Name_" on its page **and** on every card, and the remixer can't edit or remove it. If the original is deleted or made private, the credit still names the author.
- **Text and structure only.** Files, outputs, course code and show-from date are never copied (as before).
- **The original's owner is told**, and can see every remix of their project.

### Open questions

- Is there enough demand? Most students share code on GitHub, where forking already works.
- Should the remix be allowed to go public straight away, or only after it has diverged from the original?
- Can the original's owner revoke permission for existing remixes, or only for new ones?
- Does a remix count toward the original's engagement (feed ranking, trending)?

---

## Who can ask to see a hidden project

**Status:** removed from the app for now, together with the faculty role. Every account is the same and shows "U of T verified". Viewer access granted before the removal still works, and the owner can still approve or deny requests made before then.

### How it worked

The faculty role came only from an exact `@utoronto.ca` address. It did two things:

- **A profile badge:** "U of T faculty & staff" instead of "U of T verified".
- **Asking for access:** a faculty member who opened a link to a draft, or to course work before its show-from date, could ask the owner for read-only access (`POST /projects/:id/request-access`). The owner approved or denied it; nothing opened without them.

Everything else was identical for faculty and students. Moderator powers are a separate flag, set only by `grant-admin`. To bring it back, the removed code is in git history: the route in `api/src/routes/projects.ts`, `roleFor` in `api/src/lib/session.ts`, and the `RequestAccess` button in `web/src/pages/project/ProjectPage.tsx`.

### The gap it had

The route said "Only faculty and TAs can request access", but most TAs are graduate students with `@mail.utoronto.ca` or department addresses (`math.utoronto.ca`, `cs.toronto.edu`…), so they were students here and never saw the button. A TA reviewing a draft has to ask the student to publish it or share it some other way.

### Options

- **Let any signed-in account ask.** Still safe, because the owner approves every request. It is the smallest change, but anyone who has the link could send a request, not just course staff.
- **Treat department subdomains and `toronto.edu` as faculty too.** This covers more staff, but it would also give the faculty badge to graduate students, which weakens what the badge means.
- **Split the two.** Keep the badge for exact `@utoronto.ca` addresses, and give access requests to anyone the course lists as staff. That needs a list of course staff, which the app does not have.
- **Faculty only, as before.** Instructors can use it; TAs rely on the student.

### Open questions

- Do TAs actually review work on uofthub before it's published, or only after?
- Is a request from a stranger who has the link a real nuisance, given the owner can deny it?
- Should the faculty badge mean "staff address" or "teaches a course"?
