import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CONTACT_EMAIL } from '../../lib/site'
import { Prose } from './Prose'

/**
 * What we collect and who it reaches. Companion to /terms, which covers
 * ownership and moderation — [prd.md § 9](../../docs/prd.md) treats both as
 * day-one requirements rather than launch paperwork.
 *
 * Keep this honest with the code: every third party listed under "Who else
 * sees any of it" corresponds to a real integration in api. Adding
 * another one means editing this page in the same commit.
 */

const SECTIONS: { id: string; heading: string; body: ReactNode }[] = [
  {
    id: 'collect',
    heading: 'What we collect',
    body: (
      <>
        <p>Only what the platform needs to do its job:</p>
        <ul>
          <li>
            <strong>Your account</strong> — the U of T email address you sign in with, your name,
            and anything you choose to add to your profile: faculty, campus, program, class year,
            bio, avatar.
          </li>
          <li>
            <strong>What you publish</strong> — projects, descriptions, tags, links, uploaded files,
            comments, group pages and activities.
          </li>
          <li>
            <strong>Your messages</strong> — direct messages you send and receive, and the people
            you have blocked.
          </li>
          <li>
            <strong>What you do here</strong> — likes, follows, collaborator invitations, access
            requests, and a per-day count of views on each project, so owners can see interest over
            time.
          </li>
          <li>
            <strong>Operational records</strong> — server logs.
          </li>
        </ul>
        <p>
          We do not track you across other sites, run advertising, sell anything about you, or
          scrape Canvas, ACORN or any other university system. There is no analytics tag on this
          site.
        </p>
      </>
    ),
  },
  {
    id: 'why',
    heading: 'Why we have it',
    body: (
      <>
        <p>
          Your email verifies that you are at U of T — that is the only thing it verifies, and the
          only reason it is required. It also addresses the notifications you get about your own
          projects.
        </p>
        <p>
          View counts exist so a project owner can see whether anyone found their work. They are
          aggregate numbers, not a list of who looked: we record that a project was viewed on a
          date, not who viewed it.
        </p>
      </>
    ),
  },
  {
    id: 'who',
    heading: 'Who can see what',
    body: (
      <>
        <p>
          Every project is <strong>Private</strong>, <strong>U of T only</strong>, or{' '}
          <strong>Public</strong>, and it starts private. That setting is the whole access rule —
          files included. A download link is checked against the project's visibility every time it
          is used, so it cannot outlive the setting.
        </p>
        <p>
          Your name, profile and public projects are visible to anyone. Your email address is not
          shown on your profile; it is visible to a project owner when you request access to their
          project, and to moderators reviewing a report.
        </p>
        <p>
          A direct message is seen by you and the person you wrote to. If either of you reports the
          conversation, the last 30 messages between you are sent to moderators with the report.
          Blocking someone is never shown to them.
        </p>
      </>
    ),
  },
  {
    id: 'third-parties',
    heading: 'Who else sees any of it',
    body: (
      <>
        <p>
          uofthub runs on services we do not own. Each one receives only what its job requires, and
          none of them receive your work to do anything else with:
        </p>
        <ul>
          <li>
            <strong>Render</strong> — runs the API and hosts the database. Everything above is
            stored there.
          </li>
          <li>
            <strong>Cloudflare</strong> — serves the site, and stores uploaded files and avatars in
            a private bucket that is never publicly readable.
          </li>
          <li>
            <strong>Microsoft</strong> — if you sign in with your UTORid, Microsoft tells us your
            email, display name and profile photo. We never receive your password.
          </li>
          <li>
            <strong>Resend</strong> — sends the emails we send you: confirming your address,
            resetting your password, and — unless you turn them off in Settings — invitations,
            access requests, new conversations and moderation decisions. It sees the address and the
            message.
          </li>
          <li>
            <strong>Your browser’s push service</strong> — only if you turn on push notifications in
            Settings. Google (Chrome, Android), Apple (Safari, iPhone), Mozilla (Firefox) or
            Microsoft (Edge) delivers each one to your device. It sees the notification’s short text
            — who did what, never a message’s contents — and it is encrypted for your device on the
            way.
          </li>
          <li>
            <strong>OpenAI</strong> — receives the text of a search you type into{' '}
            <Link to="/discover">Discover</Link>, and the public page (or repository README) behind
            a link you import when starting a post, to fill in the form. Nothing else: not your
            projects, not your files, not your identity. Ordinary search on{' '}
            <Link to="/explore">Explore</Link> involves no third party at all.
          </li>
        </ul>
        <p>
          No student work is ever used to train an AI model, by us or by anyone we send data to.
        </p>
      </>
    ),
  },
  {
    id: 'keeping',
    heading: 'How long we keep it',
    body: (
      <>
        <p>
          Your account and your work stay until you delete them. Deleting a project removes it and
          its files; deleting your account removes your profile, projects, files, comments,
          reactions, saves, follows, collections and messages. Read notifications are deleted after
          six months.
        </p>
        <p>
          A project taken down by a moderator is <em>not</em> deleted — it is forced private, and
          stays in your account. Server logs are short-lived operational records, not a profile of
          you.
        </p>
        <p>
          Your account does not expire when you graduate. Alumni keeping their portfolio is a
          deliberate goal, not an oversight.
        </p>
      </>
    ),
  },
  {
    id: 'control',
    heading: 'What you can do about it',
    body: (
      <>
        <p>
          You can edit or delete any project at any time, change any project's visibility, edit or
          remove your profile details and avatar, and decline any collaborator invitation.
        </p>
        <p>
          From <Link to="/settings">Settings</Link> you can download a copy of your data, sign out
          everywhere, turn off email, or delete your account entirely. Anything else, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your U of T address.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    heading: 'Security',
    body: (
      <>
        <p>
          Passwords, where you set one, are stored as scrypt hashes and are never recoverable in
          plain text. Sessions are signed, HTTP-only cookies. Uploads are checked against their
          actual bytes rather than their filename, so a renamed executable is rejected.
        </p>
        <p>
          None of that makes a student project as hardened as a university system. Treat uofthub as
          a place to publish work, not as the only copy of it, and do not upload anything you are
          under an obligation to keep confidential.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    heading: 'Changes',
    body: (
      <p>
        If this policy changes in a way that affects what happens to your work or who receives it,
        the change is announced in-app before it takes effect. Questions go to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <Prose
      title="Privacy"
      lede="What we collect, why, and who else sees it."
      icon="lock"
      sections={SECTIONS}
      summary={
        <>
          The short version: we collect what the platform needs and nothing else, your projects are
          private until you say otherwise, and nobody buys any of it. The companion page on
          ownership and moderation is <Link to="/terms">Terms &amp; ownership</Link>.
        </>
      }
      footer={
        <>
          uofthub is a student project and is not officially affiliated with the University of
          Toronto.
        </>
      }
    />
  )
}
