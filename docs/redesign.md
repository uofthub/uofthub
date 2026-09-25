# The redesign

The UI was rebuilt from a `Design.html` export (seven boards: Home feed, Project page, Mobile feed, Explore, Profile, Post a project, Card system), and the backend was changed where the design needed it. This records the decisions, because several reverse earlier ones in [feed-and-density.md](feed-and-density.md) and are easy to undo by accident. The export itself has since been removed from the repo; the design lives on as `apps/web/src/index.css` and the components.

## Engagement: reactions are the only public signal

- **Likes are gone.** Two overlapping ways to say "good work" made both mean less, and the design has no like button. The `engagement` migration moved every like into an `IMPRESSIVE` reaction (keeping its timestamp) and dropped `ProjectLike`. `PROJECT_LIKED` stays in `NotificationType` only because old notifications reference it.
- **Three reactions, the design's three.** `IMPRESSIVE` (Impressive), `USEFUL` (shown as Learned something), `COLLAB` (Want to collab). The retired kinds were folded in: `WELL_DOCUMENTED` → `USEFUL`, `WOULD_USE` → `IMPRESSIVE`, with duplicates dropped rather than double-counted.
- **Want to collab is counted publicly, attributed privately.** Everyone sees the number; only the owner sees who, in Insights, and gets a one-time `PROJECT_COLLAB_INTEREST` notification per person.
- **The star on a card is `reactionTotal`.**
- **Save is a private bookmark, not a like.** `ProjectSave` never notifies and no one but the saver can see who saved. The owner sees only a count in Insights.

## Views are the owner's feedback, not a public score

- **Private.** `viewCount` is stripped from every response except to the owner (`decorate` in `lib/projectShape.ts`). A public view count rewards whatever gets clicked and makes niche work look unwanted.
- **One person, once a day.** `lib/views.ts` keys a signed-in viewer by id and anyone else by a salted hash of address and browser, stored in `ProjectViewer` for the day only. Refreshes, refetches and crawlers repeating themselves no longer count. This replaces the old "no per-viewer tracking" rule; nothing that identifies a visitor is kept past the day.

## Trending means this week

`lib/trending.ts` ranks by the last seven days: unique views + 2 × comments + 3 × reactions, ties to the newer project. It used to be all-time `viewCount`, which kept last year's work on top forever and made "Trending this week" untrue. The directory, discover, the feed's top-up and the spotlight fallback all use it.

## Real fields instead of inference

- `Project.pitch` (the card's one line), `Project.type` (eight kinds) and `Project.status` (`IN_PROGRESS`, `SHIPPED`, `HELP_WANTED`). The `project_fields` migration split existing descriptions: first paragraph → pitch, unless it was a heading or too long. Search now weights the pitch.
- `Visibility.UNLISTED`: readable by anyone with the link, never listed, not stamped as published, no follower fan-out. `PRIVATE` is shown as "Draft".
- `ProjectVersion.note`: a version with a note is an update; the note is the Updates timeline line.

## One card shape

Every list returns `CARD_INCLUDE` + `decorate()`: owner (with avatar), links, accepted collaborators, comment count, cover, reaction counts, the caller's own reactions and saved state. A feed page used to be one request plus one per card; it is one request.

## Discovery

- **Feed tabs are server-side.** `GET /feed?scope=following|campus|program` (plus `campus` and `type` filters). The blended `all` feed is unchanged.
- **A feed card says why it is there** ("Priya, who you follow, published this", "Tagged CSC343 — a course you have published in", "From St. George"), but only when that adds something to the tab: `lib/feedReason.ts` drops the reason a tab already implies, and never shows "trending" on a scoped tab, where it would be false.
- **Faculty is a fixed list** (`lib/faculties.ts`, mirrored in the web app). Free text meant "Engineering" and "FASE" never met. Old free-text values are kept until the student changes them.
- **Counts come from `GET /projects/facets`**: projects per faculty and course, this week's tags, type counts and help-wanted, cached five minutes per audience.
- **Weekly spotlight**: a moderator picks one project per Monday-to-Sunday week (`Spotlight`, Moderation → Spotlight). With no pick, `/spotlight` returns the week's most active project with `curated: false`, and the banner says so.
- **Coming up**: `GET /orgs/events/upcoming` — future events from verified groups.

## Comments

One level of replies (`Comment.parentId`; answering a reply files it under the same thread) and Helpful votes (`CommentHelpful`), with helpful comments listed first. The person replied to gets `COMMENT_REPLIED`, unless they are the owner, who already gets `PROJECT_COMMENTED`.

## Student groups and quotas

Groups were a distraction from the core of the app — sharing projects — and most of their weight was in machinery around the page rather than the page itself. They are kept, simplified:

- **Moderators create groups.** `POST /orgs` is admin-only and creates the group `VERIFIED` at once; the check that a group is real happens before the page exists. An optional `execEmail` makes that uofthub user the group's admin. Clubs & Labs → New group (moderators only), and Moderation → Groups.
- **No self-serve verification.** `POST /orgs/:slug/verify`, the 7-day deadline and the sweep that deleted expired groups are gone. `POST /admin/orgs/:slug/decision` takes only `APPROVE`/`DENY`, for any group left over from the old flow.
- **"Built with."** A project owner who is a member of a group can link the project to it (project page → More → Link to a group); cards show the verified groups a project was built with. A group admin can unlink a project with `DELETE /orgs/:slug/projects/:projectId`.
- **No storage quotas at all.** The personal 2GB and the per-term group 10GB were removed, along with `lib/terms.ts`, the `grant-term-storage` and `sweep-orgs` scripts and `.github/workflows/scheduled.yml`. Per-file size limits and the 20-file-per-project cap remain. To be revisited when storage costs are real.
- **Schema left dormant, not dropped.** `OrgStorageGrant`, `ProjectFile.orgId` and the verification columns on `Organization` stay so no data is destroyed; nothing reads or writes them. Drop them in a later migration once the decision has stuck.

## What used to be "coming soon"

Every control the design drew is now backed by the API. `soonProps` is still in the UI kit for the next designed-but-unbuilt control.

- **Profile "Open to" and links.** `User.openTo` (up to six short items), `websiteUrl`, `githubUrl`, `linkedinUrl`. The GitHub and LinkedIn links must point at those sites — the profile shows each behind that service's name — and every link is http(s) only.
- **Your courses.** `User.courses`, course codes only, up to twelve. They count towards the home feed's course affinity exactly like course tags on your own projects, so a first-year with nothing published still gets a course-shaped feed. The left rail lists them first, then the ones inferred from your projects.
- **Follow a project's updates.** `ProjectFollow`, private like a save. A version saved with a note sends `PROJECT_UPDATED` to followers who can still see the project; the owner sees a count in Insights.
- **Collections.** `Collection` + `CollectionItem`. Anyone can read one, but every list of its projects is filtered by `visibleProjectWhere` for that reader — counts included — so a collection never widens what someone can see. Only PUBLIC and UOFT projects can be added: putting a draft or a link-only project in a public list would publish it on its owner's behalf. The curator edits; a moderator can delete.
- **Messages.** One-to-one text, `Message` rows with no conversation table. `User.allowMessages` stops strangers starting a conversation but never stops a reply to someone you wrote to. Unread counts drive a header badge; the list and open conversation poll, like the bell.
- **Start from a link.** `POST /projects/import` returns what the post form can be filled with and saves nothing. GitHub repositories go through GitHub's API (description, topics, homepage, README, social image); anything else is read from its own `og:`/`twitter:`/`<title>` metadata. The server fetching a URL a user chose is the one way to point it at itself, so `lib/linkImport.ts` resolves every hostname through a lookup that refuses private, loopback, link-local and metadata addresses *at connect time* (which also covers DNS rebinding), checks IP literals directly, allows only http(s) on the default ports, re-checks every redirect, and caps time and bytes. The cover comes back as image bytes (never SVG) and is uploaded through the normal validated upload.

## Local development

`docker compose up -d` starts Postgres on 5433 and an S3 mock on 9090; the checked-in `.env.example` works against both, file uploads included. See the README.
