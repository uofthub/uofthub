# Feed, density and feedback

> **Partly superseded by [redesign.md](redesign.md).** Likes are gone (folded into reactions), there are now three reaction kinds, trending ranks this week's activity rather than all-time views, and a view is counted once per person per day. The feed and density reasoning below still stands.

This document records why `/` shows a student a feed instead of a sales pitch, why the project directory is a list instead of a grid of cards, and why a project page has a row of one-tap reactions under the Like button. It extends [ARCHITECTURE.md](ARCHITECTURE.md).

All of it is implemented. It exists as a document because the decisions are easy to reverse by accident — a card grid looks like the more designed option in a screenshot, and a feed looks like scope creep until you notice what the site feels like without one.

---

## The two complaints

Both came from using the site rather than from the spec, and they are the same complaint seen from two ends:

1. **Everything is shown as small boxes, and at any real volume that is overwhelming.** Twenty projects in a card grid is wallpaper. A hundred is unusable.
2. **There is no interaction with a project, or with the people looking at it.** You publish, and then nothing observably happens — to you, or to anybody following you.

The second is the reason the first mattered. A directory of tiles is only a browsing problem; a directory of tiles that nobody ever comes back to is a dead site.

---

## Why the directory is a list

A card grid earns its vertical cost in exactly one situation: **when the image is what you are choosing by.** That is true of Dribbble, Unsplash, Behance and Netflix, where the cover does the discriminating and the text is a caption.

It is not true here, and the code already admitted so before this change. `ProjectCard`'s cover fallback carries the comment *"most projects have no files, and without it their cards collapse to a title floating in white space."* So every card in the directory was spending 124px of vertical space to render **a coloured letter of the alphabet**. A card grid with no images is a list with worse density and no ranking.

Three properties decided it:

- **A list ranks; a grid does not.** Row one is unambiguously first. In a grid the eye lands somewhere in the middle of the first row and twelve tiles all read as equally important. This is why GitHub uses a box grid exactly once — pinned repositories — where the entire point is "these six are *not* equal to the rest". The grid is a ranking device, not a browsing device, and using it as wallpaper spends the one signal you have.
- **A list does not degrade with volume.** Twenty rows read the same as two hundred. Twenty tiles are a gallery and two hundred are a mess, and the directory pages forever.
- **A list is scanned by text**, which is what a project actually is here: a title, a sentence, an owner, a course code.

### What that means in the code

- `storedView()` in `DirectoryPage.tsx` defaults to `'list'`. The grid is still one click away and the choice is remembered per browser — this is a default, not a removal.
- List mode narrows the whole page to a **920px reading column**, header and filters included. A 76px thumbnail and a 14px description stretched across a 1600px monitor is its own kind of unreadable. Grid mode keeps the full width, which is what a gallery wants.
- `/courses/:tag` and `/discover` use the list too. They are the same directory filtered differently, and it would be strange for them to disagree with `/projects` about how student work is shown. `/discover` in particular is a *ranked* result set, where a grid says nothing about which answer came first.
- Profiles keep the grid for **pinned** projects only, and nothing else. See below.

---

## Pinned projects

`Project.pinnedAt`, `POST /projects/:id/pin`, `GET /users/:id/pinned`.

Pinning is the GitHub lesson applied literally. A profile's pinned strip is the one place a card grid is right — a small, deliberately chosen set where the visual weight *is* the message — so it is the one place a profile still renders cards. Everything below it is a list with **Show more**.

Decisions worth keeping:

- **Six, like GitHub.** Not an arbitrary cap: past a row or two, the grid stops ranking and the strip becomes the wallpaper it was meant to replace. The API enforces it and returns a message that says how to make room, because a button that silently does nothing reads as a bug.
- **Pinned projects still appear in the list below.** GitHub does the same. The strip is a highlight, not a separate collection.
- **`GET /users/:id/pinned` is its own endpoint** rather than a flag on the paged project list. The list is newest-first, so a project pinned a year ago would not be on the first page, and a half-complete pinned strip is worse than none.
- **The pin control lives on the project page, not the profile.** A profile row is a whole anchor; a `<button>` inside an `<a>` is invalid markup that silently breaks the row's click target. `ProjectCard.tsx` already carries a comment about this from an earlier bug.
- Visibility applies. A pinned `PRIVATE` project is pinned for the owner's own benefit and nobody else sees it.

---

## The signed-in home feed

`GET /feed`, rendered by `FeedHome.tsx`.

`/` used to be the marketing page whether or not you had an account, so somebody who had been publishing here for a month still landed on "Get started" and a product screenshot every visit. `Layout.tsx` switches the surrounding chrome on the same condition: a visitor gets the centred landing nav and tall footer, a student gets the sidebar and the app bar like every other signed-in page.

### Nothing in it is manufactured

Every row is a real project that was really published. There are no synthetic "X is now following Y" events and no engagement bait. What the feed adds is the **reason** a project reached you, said plainly:

| Reason | Meaning |
| --- | --- |
| `FOLLOWING` | Its owner is somebody you follow |
| `COURSE` | It is tagged with a course you have published in yourself |
| `CAMPUS` | Its owner is at your campus |
| `TRENDING` | The top-up, so a brand-new account still lands on something |

The first three are the *connected* feed, ordered by publish time. `TRENDING` only appears once the connected set runs out. A project in the top-up is labelled `TRENDING` **even if it also happens to be from your campus** — it is there because the connected feed ran dry, and saying otherwise would make the feed look better connected than it is.

Reasons are assigned in priority order, strongest first. A feed that said "from your campus" about somebody you deliberately follow would be technically true and useless.

### `publishedAt`

The feed orders by `Project.publishedAt`, not `createdAt`. A capstone drafted in January and opened up in March belongs in March's feed. The column is stamped once, by `lib/publishing.ts`, at the transition out of `PRIVATE` — from `POST /projects` for a project created open, and from `PATCH /projects/:id` for the edit that opens a draft up.

It is deliberately idempotent. A student who flips a project `UOFT → PRIVATE → UOFT` while tidying it up has not published it twice, and their followers must not hear about it twice. The migration backfills `publishedAt = createdAt` for everything already visible, so the feed is not empty on the day it ships.

Both `ProjectCard` and `ProjectRow` date a project by `publishedAt ?? createdAt` for the same reason.

### Paging across two sources

The connected half and the trending top-up are one list to the caller. The route counts the connected set, serves from it while `skip` is inside it, and continues into trending past the end — so "Show more" keeps working across the seam, and a project already shown in the connected half is excluded from the top-up underneath it.

### The activity card

`GET /feed/activity` answers the second complaint directly. A view counter that only moves when you reload your own page tells you nothing, so the card reports:

- **This week's views against last week's.** One number cannot tell "quiet" apart from "slowing down". The delta is hidden entirely when last week was zero — "up 100%" from a week that had not happened yet is noise dressed as a trend.
- **Likes, comments and reactions**, excluding the owner's own. Liking your own project is allowed; it is not engagement.
- **Recent comments with names and text**, and who liked it most recently. This is the part that matters: "somebody commented" is a number, *"Priya on Autonomous gripper: how did you calibrate it?"* is a person.

It is only rendered to students who have published something. There is nothing honest to report to an account with no work on the site.

Views stay anonymous — no per-viewer identity is recorded, and the `ProjectDailyView` model deliberately has no `userId`. Likes are already attributed on the project page, so showing the owner *who* liked their work reveals nothing new, which is why `GET /projects/:id/analytics` now returns `recentLikes` with names.

---

## Social notifications

Before this, every `NotificationType` was administrative — invites, access requests, moderation. Nothing told you that somebody liked, commented on or forked your work, or that somebody you follow had published. Following a person was a button that did nothing observable.

Six types were added: `PROJECT_LIKED`, `PROJECT_COMMENTED`, `PROJECT_FORKED`, `PROJECT_REACTED`, `FOLLOWED_YOU`, `FOLLOWING_PUBLISHED`.

### Not being able to pester somebody is part of the design

Every social notification is triggered by another student's action, which means every one of them is also a way to annoy somebody. The rules live in `lib/notifications.ts` rather than at the call sites:

- **`notify`** — for announcements that are genuinely new each time: a comment, a fork.
- **`notifyOnce`** — for states a person can *toggle*: a like, a follow, a reaction. `Notification.key` holds the identity of the thing announced (`like:<projectId>:<actorId>`), so un-liking and re-liking a project twenty times is one notification, not twenty. Two different people liking the same project are two different keys and both get through.
- **`notifyMany`** — the follower fan-out on publish, capped at `FANOUT_LIMIT` (500). This is the one notification that scales with somebody else's popularity rather than their own actions, so it gets a ceiling. The publish still succeeds and the feed still shows the project to every follower; only the bell stops short.
- **Nobody is ever notified about their own action.** That check belongs to the caller, which is the only place that knows who the actor is.

A reaction is keyed **per person per project, not per kind**: somebody working through all four chips is one piece of feedback, not four pings.

### The message is the feature

`lib/notifications.ts` on the web side (separate from the bell component, so it can be tested without mounting React) carries the copy. The rule it follows: *"somebody commented on your project"* is a notification you have to go and decode. The comment excerpt rides along in the payload — capped at 140 characters — so the bell says what was actually said, and the link goes straight to `?tab=comments` rather than the overview tab the comment is hidden behind.

---

## Reactions

`ProjectReaction`, four kinds: `USEFUL`, `IMPRESSIVE`, `WELL_DOCUMENTED`, `WOULD_USE`.

A blank *"Leave a comment…"* box on a stranger's capstone collects nothing, forever. Writing a sentence about somebody else's work is a real decision — you have to have something to say, and be willing to sign your name to it. Tapping "Well documented" is not a decision, and it still says something the owner can use.

Deliberate boundaries:

- **Not a second Like.** Like stays the headline action and the counted one; it feeds analytics and always will. Reactions sit below it under their own heading — *"Quick feedback — tell them what worked"* — because they answer a different question. A row of feedback chips competing with the headline action would read as five ways to say the same thing.
- **Not a rating.** There is no negative reaction and there is not going to be one. Public downvoting on a first-year's coursework is a different product.
- **One row per kind, not flags on one row.** A student can say a project is both useful and well documented without the two answers overwriting each other.
- **Read back as a sentence.** The project page renders *"4 found this useful · 2 found it well documented"* rather than counts beside labels. `4` next to a word is a score; the sentence is somebody's opinion of the work.
- A signed-out reader sees only the kinds people actually chose. An unpressable row of zeroes is clutter.

---

## What is deliberately not here

- **No email delivery.** Still the open item from [ROADMAP.md](ROADMAP.md) § Notifications. The in-app bell is the only channel, and the fan-out cap above is sized for that — an email fan-out would need a different ceiling and a per-student preference.
- **No per-viewer view tracking.** "3 people from Engineering looked at this" would need viewer identity on every view, which is a privacy decision rather than a feature decision, and the honest version of it — names on likes, a week-over-week view trend — turned out to answer the same question.
- **No realtime.** The bell still polls every 30 seconds. WebSockets remain deferred, for the reason recorded in the roadmap.
- **No algorithmic ranking.** The connected feed is ordered by publish time, and the top-up by view count. Nothing is scored, weighted or personalised beyond the four reasons above, all of which a student can explain to themselves from the row.
