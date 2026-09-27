# Not decided yet

Features that have been discussed but not committed to. Nothing here is on the roadmap until the open questions are answered; when one is decided, it moves to [ROADMAP.md](ROADMAP.md) and out of this file.

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
- **Permanent attribution.** The copy says "Built on *Title* by *Name*" on its page **and** on every card, and the remixer can't edit or remove it. If the original is deleted or made private, the credit still names the author.
- **Text and structure only.** Files, outputs, course code and show-from date are never copied (as before).
- **The original's owner is told**, and can see every remix of their project.

### Open questions

- Is there enough demand? Most students share code on GitHub, where forking already works.
- Should the remix be allowed to go public straight away, or only after it has diverged from the original?
- Can the original's owner revoke permission for existing remixes, or only for new ones?
- Does a remix count toward the original's engagement (feed ranking, trending)?
