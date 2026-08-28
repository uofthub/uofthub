# Student Groups

This document specifies the verification, storage, and activity-publishing model for student groups (clubs and research labs) — the `Organization` entity in `schema.prisma` (`OrgType`: `CLUB` | `LAB`). It extends [ARCHITECTURE.md](ARCHITECTURE.md). All of it is now implemented; where the build differs from what was specified here, the difference is called out inline and collected under [What shipped](#what-shipped).

---

## Why groups need a separate policy from individual accounts

Individual accounts are verified once, at signup, via domain-restricted `@mail.utoronto.ca` OAuth — a real person authenticating with a university-issued mailbox. A group is a claim ("I represent X club") made by whoever happens to create the page, which OAuth can't confirm on its own. Groups also turn over executives and run on a term-based rhythm, so a flat indefinite quota doesn't fit them the way it fits a person. The two policies diverge from here on:

- **Individual accounts** — unchanged. Flat 2GB, per person, indefinite (see [ARCHITECTURE.md § File storage](ARCHITECTURE.md#file-storage)). It does not reset annually and does not expire on graduation — there's no reliable way to distinguish an inactive alumnus from a currently-enrolled student, and the roadmap already commits to alumni-persistent portfolios. Tying it to an academic-year clock would just mean guessing at that distinction.
- **Student groups** — storage resets on a per-term cadence, and a group is invisible to everyone but its creator until it clears a verification step. Covered below.

---

## Verification workflow

### 1. Creation → pending, private

Any authenticated student can create a group, self-identifying as authorized to represent it: name, description, a claimed role (e.g. "president," "lab manager"), and a contact email/phone for follow-up. On creation the group enters `PENDING_VERIFICATION`:

- Not listed on `/orgs`, not searchable, not viewable by anyone but the creator.
- The creator sees a persistent banner: *"Submit verification within 7 days or this group is automatically deleted."*

### 2. Submission stops the clock

The creator submits verification material (what counts is still open — see below). Submitting before the 7-day deadline stops the countdown and moves the group to `IN_REVIEW`; an email notifies the admin team that a request is waiting.

Nothing submitted within 7 days → the group and any data attached to it are deleted automatically. No manual cleanup needed for abandoned or spam creations.

### 3. Admin review

Admins review pending requests on an admin portal (new surface, not yet built — see [ROADMAP.md](ROADMAP.md)). Three outcomes:

| Decision | When | Effect |
|---|---|---|
| **Approve** | Evidence reasonably supports the claim | Group → `VERIFIED`, becomes publicly listed/visible. The contact from step 1 is notified. |
| **Request more info** | Evidence is incomplete but not obviously bogus | Group → `INFO_REQUESTED`; creator is told what's missing and gets a fresh 7-day window to respond (same auto-delete-on-timeout as step 1). |
| **Deny** | Spam, or no reasonable evidence of authorization | Group and its data are deleted; contact is notified of the denial. Reserved for clear-cut cases — anything requiring judgment goes through "request more info" instead. |

### Status flow

```
PENDING_VERIFICATION ──(submit)──▶ IN_REVIEW ──(approve)──▶ VERIFIED
        │                              │
        │(timeout, 7d)                 ├──(request info)──▶ INFO_REQUESTED ──(submit)──▶ IN_REVIEW
        ▼                              │                          │
    deleted                            │                          │(timeout, 7d)
                                        │                          ▼
                                        └──(deny)──▶ deleted   deleted
```

### Open questions

- What evidence actually counts as sufficient proof of authorization? There's no official U of T club/lab registry API to check against automatically (this mirrors the general student-verification open question in [prd.md § 12](prd.md#12-open-questions)).
- Can a `VERIFIED` group be revoked later — reported as fraudulent, or the group goes defunct?
- If a second exec joins a `VERIFIED` group, do they need their own verification, or can the existing admin add members freely? `OrgMember` already supports multiple members with roles; assume the latter unless this needs tightening.

---

## Storage policy

| Scope | Limit |
|---|---|
| Per-term allowance | 10GB, granted fresh at the start of each academic term |
| Cumulative | Allowances stack — total quota is the sum of every term's allowance since verification. Nothing is deleted or reclaimed when a new term starts. |
| Requesting more | Same manual-review process as individual accounts ([ARCHITECTURE.md § Requesting more space](ARCHITECTURE.md#requesting-more-space)): the group contact states why, reviewed within 2 business days, and an approved increase applies to that group only. |
| Eligibility | Only `VERIFIED` groups get the group quota — `PENDING_VERIFICATION` / `IN_REVIEW` / `INFO_REQUESTED` groups cannot upload files. |

File type allowlist and per-file size limits are shared with individual accounts (ARCHITECTURE.md) — only the total-quota scope and per-term cadence differ.

---

## Publishing activities

Groups can publish **activities** — a lighter-weight post type than a `Project`, for meetings, events, workshops, or recaps that don't warrant a full project page. Draft shape, pending an actual data model:

| Field | Notes |
|---|---|
| title | |
| description | |
| date | when the activity happened/happens |
| link | optional — signup form, recap doc, etc. |
| image | optional |

Activities render on the group's `/orgs/:slug` page in reverse-chronological order. Whether they also surface in the platform-wide discovery/trending feed alongside `Project`s is an open design question — leaning toward org-page-only for now, to keep the main discovery feed project-focused.

---

## External integrations

- **Discord** — near-term. A group can link its Discord server on its org page (an invite link, at minimum; a richer embed/widget is a nice-to-have, not a requirement). No two-way sync — e.g. auto-importing announcements as activities — is planned yet; that's a larger scope than a link and would need its own design pass.
- **GroupMe** — now built, on the same terms as Discord: `groupMeUrl` on the group, host-restricted to groupme.com, rendered as a badge. It was deferred until Discord shipped rather than built alongside it, so the pattern was settled once and then reused. Still no two-way sync on either.

---

## What shipped

Implemented across [orgs.ts](../apps/api/src/routes/orgs.ts) (create / gate / verify / activities), [admin.ts](../apps/api/src/routes/admin.ts) (the review queue and decisions), [lib/orgs.ts](../apps/api/src/lib/orgs.ts) and [lib/terms.ts](../apps/api/src/lib/terms.ts) (the rules), [lib/orgEmails.ts](../apps/api/src/lib/orgEmails.ts) (the copy), and `OrgPage.tsx` / `OrgsPage.tsx` / `AdminPage.tsx` on the web side. Where the build reads differently from the spec above:

- **Visible to members, not just "the creator".** Membership is the set the data model can express, and it is the same set at creation. A group's own members also still see it on `/orgs` — listed separately, under "Your groups, not yet public" — because hiding it from them entirely would leave nobody a route back to the page they have 7 days to verify.
- **`contactEmail` + `contactRole`, not one `contactInfo` field.** A decision email needs a real address, and the claimed role is what a reviewer weighs the claim against; one freeform column made both unusable. The group's submission (`verificationNote`) and the admin's reply (`reviewNote`) are likewise separate — different authors, and both have to survive a round trip through "request more info".
- **An unverified group's files bill the uploader, not nobody.** "Cannot upload files" is implemented as "has no group allowance": uploads fall back to the member's personal 2GB. Blocking the upload outright would have made joining an unverified group *reduce* what a student can store on their own projects.
- **The billed group is stamped on the file.** `ProjectFile.orgId` is written at upload time rather than derived from the project's org links later, so quota already spent never moves between accounts when links change.
- **Activity images are URLs, not uploads.** An upload would have to bill a quota, and an activity is meant to be lightweight.
- **Discord and GroupMe links are host-restricted** to their own domains, since each renders behind a service badge.
- **The deadline is enforced in two places.** The sweep (`sweep-orgs`, run daily by cron) deletes expired groups, and `POST /orgs/:slug/verify` independently refuses a deadline that has passed — a missed cron run delays cleanup rather than quietly reopening the window.
- **Groups created before verification existed were grandfathered as `VERIFIED`** by the migration. They were published under the old rule; retroactively hiding them behind a deadline they never had a chance to meet — and then sweeping them away — would have been wrong.

Still open, and still policy rather than code: what evidence actually counts (the three questions under [Open questions](#open-questions) above are unchanged), and whether a `VERIFIED` group can be revoked later. Revocation has no path today — an approved group stays approved.
