import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, SOURCE_URL } from '../../lib/site'
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
            <strong>What you do here</strong> — reactions, follows, saves, collaborator and group
            invitations, and a per-day count of views on each project, so owners can see interest
            over time.
          </li>
          <li>
            <strong>Addresses you invite</strong> — when you invite a U of T address that has no
            account yet, we keep that address with the invitation, so it can be handed over once
            someone signs up with it. Withdrawing the invitation deletes it.
          </li>
          <li>
            <strong>QR code scans</strong> — when you scan one of our printed codes, like the
            sticker on a laptop lid, we record which code it was, when, your browser's name and
            version, the page that sent you if there was one, and a scrambled code for that day. We
            do not record your address.
          </li>
          <li>
            <strong>Your agreement to the Terms</strong> — when you agreed to the{' '}
            <Link to="/terms">Terms</Link>, each time you are asked to.
          </li>
          <li>
            <strong>Reports</strong> — when you report something, who you are, what you reported and
            why, and a copy of it as it read at the time. The person you reported is never told who
            reported them.
          </li>
          <li>
            <strong>Operational records</strong> — server logs, and a list of sessions that were
            signed out, kept only until they would have expired anyway.
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
          View counts exist so a project owner can see whether anyone found their work, and owners
          only ever see numbers, never who looked. To count each person once a day, we note for that
          day that a viewer was there — your account if you are signed in, or else a scrambled code
          made from your connection that cannot be turned back into it — and delete that note the
          next day.
        </p>
        <p>
          QR code scans tell us whether a sticker or poster brings anyone here, and how many
          different people. The scrambled code is made from your connection and browser with a
          secret that changes every day, so it cannot be turned back into your address, and your
          scans on different days cannot be linked to each other. Scans are counted on our own
          server; no third party is involved.
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
          Your name, profile and public projects are visible to anyone. Who you follow and who
          follows you is visible to signed-in U of T students only. Your email address is never
          shown on your profile; moderators see it when they review a report.
        </p>
        <p>
          When someone invites you to a project or group, they typed your address. Until you accept,
          they see only that address — not your name, your profile, or even whether you have an
          account.
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
            stored there. It also runs our image scanner, described below.
          </li>
          <li>
            <strong>Cloudflare</strong> — serves the site, and stores uploaded files, avatars and
            group event images in a private bucket that is never publicly readable.
          </li>
          <li>
            <strong>Microsoft</strong> — if you sign in with your UTORid, Microsoft tells us your
            email, display name and profile photo. We never receive your password.
          </li>
          <li>
            <strong>Resend</strong> — sends the emails we send you: confirming your address,
            resetting your password, and — unless you turn them off in Settings — invitations, new
            conversations and moderation decisions. It also sends one email to an address someone
            invites that has no account yet. It sees the address and the message.
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
        <p>
          Every image you upload — a profile photo, a project image or thumbnail, an event image —
          is checked automatically for nudity, a minute or two after it goes up, by an open-source
          model (NudeNet) that we run ourselves on Render. The image goes to that scanner and
          nowhere else, and the scanner keeps nothing. If it flags an image, the image is hidden and
          a moderator looks at it; if they decide it was a false alarm, it comes back. Videos, PDFs
          and other files are not scanned.
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
          When something is taken down for sexual content, an image we remove is kept in private
          storage instead of being deleted, linked to the report, and seen by nobody but moderators.
          If it involves a person under 18, we give it and the account details behind it to the
          police and to Cybertip.ca, as Canadian law requires. See{' '}
          <Link to="/terms#sexual-content">No sexual content</Link>.
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
          plain text. Sessions are signed, HTTP-only cookies, and signing out ends the session for
          good. Uploads are checked against their actual bytes rather than their filename, so a
          renamed executable is rejected.
        </p>
        <p>
          uofthub is open source, so anyone can <a href={SOURCE_URL}>read the code</a> and check all
          of this for themselves. If you find a security problem, please report it privately as our{' '}
          <a href={`${SOURCE_URL}/blob/main/SECURITY.md`}>security policy</a> describes, not in a
          public issue.
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
      updated="2026-10-02"
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
