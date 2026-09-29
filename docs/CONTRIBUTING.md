# Contributing to uofthub

Thanks for your interest in contributing. uofthub is an open-source project built for U of T students, and contributions from the community are what make it work.

---

## Ways to contribute

- **Bug reports** — open an issue describing what you saw vs. what you expected
- **Feature requests** — check the [roadmap](ROADMAP.md) first, then open an issue
- **Code** — pick up an open issue, or propose a change in an issue before writing a large PR
- **Design** — UI/UX feedback and mockups are welcome
- **Docs** — corrections, clarifications, or new guides

---

## Before you start

New to the codebase? Issues labelled [good first issue](https://github.com/uofthub/uofthub/labels/good%20first%20issue) are small, self-contained and say where to look. Comment on one to claim it.

1. Check [open issues](https://github.com/uofthub/uofthub/issues) to avoid duplicating work.
2. For anything non-trivial, open or comment on an issue first so we can align on approach before you write code.
3. Fork the repo and create a branch from `main`.
4. Set up locally with the steps in the [README](../README.md#getting-started): `pnpm install`, `docker compose up -d` for Postgres and the S3 mock, copy the two `.env.example` files, then `pnpm dev`.

---

## Running the checks

The same commands CI runs, from the repo root:

```bash
pnpm typecheck
pnpm --filter @uofthub/api test   # needs the Postgres in docker-compose.yml running
pnpm --filter @uofthub/web test
pnpm build
pnpm lint
```

The API tests create their own database — your `DATABASE_URL`'s name with `_test` appended — apply the migrations to it, and truncate every table between cases. A database whose name doesn't end in `_test` is refused outright, so the suite can't wipe your development data. Override the target with `TEST_DATABASE_URL` if you need to.

Add a test with the change when you touch a route that decides who can see or do something. `src/routes/projects.visibility.test.ts` is the pattern to copy: real requests through `app.inject()`, real database, assertions on status codes rather than on internals.

Web tests (Vitest, Testing Library, jsdom) cover the pieces with logic rather than layout — card rendering, the editor's draft and save rules, section and output helpers. They need no database.

---

## Pull request process

1. Keep PRs focused — one logical change per PR.
2. Write a clear description: what changed and why, and how you checked it. The PR template has the checklist.
3. Make sure the checks above pass locally. CI runs them on every PR (typecheck, tests, build, lint), plus a dependency audit, a secret scan and CodeQL.
4. Add or update tests for what you changed.
5. Mark the PR ready for review; a maintainer is requested automatically.

### How PRs are reviewed

- **CI must be green.** `main` is protected: a PR can't merge until every required check passes and a maintainer has approved it.
- **Expect a first response within about a week.** It may be a review, a question, or a note that the change doesn't fit the [roadmap](ROADMAP.md) right now.
- **Reviews look at:** whether the change does what it says; tests for anything that decides who can see or do something; privacy and security (see below); and whether it reads like the code around it.
- **Changes requested are normal.** Push fixes to the same branch; there's no need to open a new PR. PRs quiet for a month without a reply may be closed, and can be reopened any time.

---

## Code style

`pnpm format` runs Prettier, which also sorts Tailwind classes.

### Styling (web)

The web app is styled with Tailwind CSS v4, written as utility classes in the components. There are no per-component stylesheets.

- **Tokens live in `src/index.css`** as a Tailwind `@theme`: colours (`bg-surface`, `text-ink-3`, `border-line`, `text-navy-ink`…), type sizes named by pixel value (`text-15`), `rounded-card`, `shadow-pop`, and so on. Tailwind's own palette is switched off, so use a token rather than `bg-blue-500`. Dark mode redefines the same tokens, so most components need no `dark:` classes at all.
- **Reach for a component before a class list.** `src/components/ui` has `Button`, `Chip`, `Card`, `Panel`, `Heading`, `Eyebrow`, `PageTitle`, `Page`, `Notice`, `Field`, `Dialog` and friends. If the same handful of classes shows up in a third place, it probably wants to be a component.
- **Combine classes with `cx`** (from `components/ui`). It merges Tailwind classes, so a `className` passed to a component overrides its defaults — `<Heading className="text-18">` replaces the 22px default rather than fighting it.
- **Breakpoints are mobile first**: `sm` 640, `md` 720 (the phone line; `PHONE` in `lib/hooks.ts` matches it), `lg` 960, `xl` 1100, `2xl` 1200.
- Keep `style={{…}}` for values that come from data (an avatar's size, a faculty's colour, a chart bar's height).

---

## Commit messages

Use the imperative mood and keep the subject line under 72 characters:

```
Add project visibility toggle
Fix search not returning results for multi-word queries
Update profile page to show faculty
```

---

## License of contributions

uofthub is licensed under the [GNU AGPL v3.0 or later](../LICENSE). By opening a pull request you agree that your contribution is licensed under the same terms, and that you have the right to contribute it.

---

## Privacy & safety

uofthub handles student data. If your contribution touches auth, file uploads, visibility controls, or user data, note it explicitly in the PR description and flag any privacy implications.

Do not introduce features that:

- Automatically access or scrape university systems (Canvas, ACORN, etc.)
- Bypass student-controlled visibility settings
- Claim rights to student-uploaded content

**Found a vulnerability?** Don't open an issue or a PR that describes it — report it privately as [SECURITY.md](../SECURITY.md) explains.

---

## Questions?

Open an issue, or email hello@uofthub.com.
