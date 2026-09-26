# @uofthub/web

The uofthub web app: React 19 + Vite, React Router 7, TanStack Query, Tailwind CSS v4.

Setup, the full stack and how to run everything together are in the [root README](../README.md). From the repo root:

```bash
pnpm --filter @uofthub/web dev    # http://localhost:5173, talks to the API on :3001
pnpm --filter @uofthub/web test
pnpm --filter @uofthub/web build
pnpm --filter @uofthub/web lint   # oxlint
```

`VITE_API_URL` in `.env` points it at the API (see `.env.example`).

## Layout

| Path | |
|---|---|
| `src/App.tsx` | Every route. Rarely opened pages (admin, editor, messages, collections, discover) are lazy-loaded |
| `src/components/shell` | The chrome: desktop header, phone header and bottom bar, footers, account menu, notification bell, ⌘K command palette |
| `src/components/ui` | Primitives — `Button`, `Card`, `Chip`, `Dialog`, `Field`, `Tabs`, `Page`, type components and `cx` |
| `src/components/project` | Project cards, feed cards, covers, the reaction bar |
| `src/pages` | One folder per area |
| `src/lib` | API client, auth, queries, and the logic worth testing on its own |
| `src/index.css` | The Tailwind `@theme` — every colour, size and shadow token, with dark mode |

## Pages

| Route | |
|---|---|
| `/` | Landing page for visitors; a signed-in student is sent to `/feed` |
| `/feed` | The student's home: the week's spotlight above Following / Campus / Your program tabs, a left rail (navigation, your courses) and, on wide screens, a right rail (your week's activity, trending, upcoming events, people in your program) |
| `/explore` | Search and filter every project; `/projects` and `/courses/:code` redirect here |
| `/projects/new`, `/projects/:id/edit` | The editor — make and edit a project on one page, publish last |
| `/projects/:id` | A project |
| `/u/:id` | A profile |
| `/saved`, `/help-wanted` | Saved projects, and projects looking for help |
| `/collections`, `/collections/:id` | Collections |
| `/messages`, `/messages/:userId` | Direct messages |
| `/orgs`, `/orgs/:slug` | Clubs & labs |
| `/discover` | AI search |
| `/admin` | Moderation (moderators only) |
| `/session` | Sign in / sign up |
| `/about`, `/terms`, `/privacy` | Info pages |

Styling conventions are in [CONTRIBUTING.md § Styling](../docs/CONTRIBUTING.md#styling-web).
