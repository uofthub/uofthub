# Student Groups

This document specifies the verification, storage, and activity-publishing model for student groups (clubs and research labs) — the `Organization` entity in `schema.prisma` (`OrgType`: `CLUB` | `LAB`). It extends [ARCHITECTURE.md](ARCHITECTURE.md) and is **policy/design only** — nothing here is implemented yet. See [Not yet built](#not-yet-built).

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
- **GroupMe** — same treatment, explicitly deferred. Do not build alongside Discord.

---

## Not yet built

Everything above is policy/design only. As of this writing, `POST /orgs` ([orgs.ts](../apps/api/src/routes/orgs.ts)) creates and publicly lists a group immediately, with no verification step, no per-org storage tracking, no activity model, and no admin portal. See [ROADMAP.md](ROADMAP.md) for sequencing.
