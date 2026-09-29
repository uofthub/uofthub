# Security policy

uofthub handles U of T students' sign-ins, email addresses, private drafts and messages, so we take reports seriously and thank the people who make them.

## Reporting a vulnerability

**Please don't open a public issue, pull request or discussion about a vulnerability.** Report it privately, in either of these ways:

- **GitHub:** use [Report a vulnerability](https://github.com/uofthub/uofthub/security/advisories/new) on the repository's Security tab. This is the preferred route: it keeps the report, the discussion and the fix in one private place.
- **Email:** hello@uofthub.com, with "Security" in the subject.

Include what you found, where (a URL, a route, a file and line), the steps to reproduce it, and what an attacker could do with it. A proof of concept helps, but isn't required.

## What happens next

- We aim to acknowledge a report within **3 days**, and to give you a first assessment within **7 days**.
- We keep you updated while we work on a fix, and tell you when it's deployed.
- Once it's fixed we publish a GitHub security advisory, and credit you in it unless you'd rather not be named.
- Please give us a reasonable time to fix the issue — normally up to **90 days** — before you disclose it publicly.

## Scope

In scope:

- This repository: the API (`api/`), the web app (`web/`), and its Cloudflare Pages Functions (`web/functions/`).
- The live site at [uofthub.com](https://uofthub.com) and the API at `api.uofthub.com`.

Especially interesting: anything that lets one account read or change another's data, see a draft or private project it shouldn't, sign in as someone else, get past the U of T address check, or make the server fetch something it shouldn't.

Out of scope:

- Reports from automated scanners with no demonstrated impact.
- Missing best-practice headers or settings with no exploit.
- Denial of service by sheer volume, spam, or social engineering of students or maintainers.
- Vulnerabilities in third-party services (Microsoft, Cloudflare, Render, Resend, OpenAI) — report those to the vendor.

## Testing safely

When testing against the live site:

- Use only accounts you own. Never access, change or delete another student's data — stop and report as soon as you can see data that isn't yours.
- Don't run load tests, and don't send email or messages to people who didn't agree to it.
- Better still, run uofthub locally (see the [README](README.md#getting-started)) and test there.

We won't pursue or support legal action against anyone who follows this policy in good faith.

## Supported versions

Only the current `main` branch, which is what runs on uofthub.com, receives security fixes.
