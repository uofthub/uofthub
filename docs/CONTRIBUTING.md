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

1. Check [open issues](https://github.com/renfrrd-ai/uofthub/issues) to avoid duplicating work.
2. For anything non-trivial, open or comment on an issue first so we can align on approach before you write code.
3. Fork the repo and create a branch from `main`.

---

## Running the checks

The same four commands CI runs, from the repo root:

```bash
pnpm typecheck
pnpm --filter @uofthub/api test   # needs the Postgres in docker-compose.yml running
pnpm build
pnpm lint
```

The API tests create their own database — your `DATABASE_URL`'s name with `_test` appended — apply the migrations to it, and truncate every table between cases. A database whose name doesn't end in `_test` is refused outright, so the suite can't wipe your development data. Override the target with `TEST_DATABASE_URL` if you need to.

Add a test with the change when you touch a route that decides who can see or do something. `src/routes/projects.visibility.test.ts` is the pattern to copy: real requests through `app.inject()`, real database, assertions on status codes rather than on internals.

---

## Pull request process

1. Keep PRs focused — one logical change per PR.
2. Write a clear description: what changed and why.
3. Make sure tests pass and linting is clean.
4. Request review from a maintainer.
5. Address review feedback; PRs are merged once approved.

---

## Code style

> Code style conventions will be documented here once the stack and tooling are finalized.

---

## Commit messages

Use the imperative mood and keep the subject line under 72 characters:

```
Add project visibility toggle
Fix search not returning results for multi-word queries
Update profile page to show faculty
```

---

## Privacy & safety

uofthub handles student data. If your contribution touches auth, file uploads, visibility controls, or user data, note it explicitly in the PR description and flag any privacy implications.

Do not introduce features that:
- Automatically access or scrape university systems (Canvas, ACORN, etc.)
- Bypass student-controlled visibility settings
- Claim rights to student-uploaded content

---

## Questions?

Open a discussion or reach out via the issue tracker.
