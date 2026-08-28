import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePageCrumbs } from '../lib/crumbs'
import { Card, Icon, PageHeader } from '../components/ui'
import { CONTACT_EMAIL } from '../components/layout/nav'

/**
 * What we collect and who it reaches. Companion to /terms, which covers
 * ownership and moderation — [prd.md § 9](../../docs/prd.md) treats both as
 * day-one requirements rather than launch paperwork.
 *
 * Keep this honest with the code: every third party listed under "Who else
 * sees any of it" corresponds to a real integration in apps/api. Adding
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
            <strong>Your account</strong> — the U of T email address you sign in with, your name, and anything
            you choose to add to your profile: faculty, program, class year, bio, avatar.
          </li>
          <li>
            <strong>What you publish</strong> — projects, descriptions, tags, links, uploaded files, comments,
            group pages and activities.
          </li>
          <li>
            <strong>What you do here</strong> — likes, follows, collaborator invitations, access requests, and a
            per-day count of views on each project, so owners can see interest over time.
          </li>
          <li>
            <strong>Operational records</strong> — server logs, and error reports when something breaks.
          </li>
        </ul>
        <p>
          We do not track you across other sites, run advertising, sell anything about you, or scrape Canvas,
          ACORN or any other university system. There is no analytics tag on this site.
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
          Your email verifies that you are at U of T — that is the only thing it verifies, and the only reason it
          is required. It also addresses the notifications you get about your own projects.
        </p>
        <p>
          View counts exist so a project owner can see whether anyone found their work. They are aggregate
          numbers, not a list of who looked: we record that a project was viewed on a date, not who viewed it.
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
          Every project is <strong>Private</strong>, <strong>U of T only</strong>, or <strong>Public</strong>, and
          it starts private. That setting is the whole access rule — files included. A download link is checked
          against the project's visibility every time it is used, so it cannot outlive the setting.
        </p>
        <p>
          Your name, profile and public projects are visible to anyone. Your email address is not shown on your
          profile; it is visible to a project owner when you request access to their project, and to moderators
          reviewing a report.
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
          uofthub runs on services we do not own. Each one receives only what its job requires, and none of them
          receive your work to do anything else with:
        </p>
        <ul>
          <li>
            <strong>Railway</strong> — runs the API and hosts the database. Everything above is stored there.
          </li>
          <li>
            <strong>Cloudflare</strong> — serves the site, and stores uploaded files and avatars in a private
            bucket that is never publicly readable.
          </li>
          <li>
            <strong>Microsoft</strong> — if you sign in with your UTORid, Microsoft tells us your email, display
            name and profile photo. We never receive your password.
          </li>
          <li>
            <strong>Resend</strong> — sends the emails we send you (group verification decisions). It sees the
            address and the message.
          </li>
          <li>
            <strong>OpenAI</strong> — receives the text of a search you type into <Link to="/discover">Discover</Link>,
            and nothing else. Not your projects, not your files, not your identity. Ordinary search on{' '}
            <Link to="/projects">Projects</Link> involves no third party at all.
          </li>
          <li>
            <strong>Clueline</strong> — receives an error report when the site breaks: the error, where in the app
            it happened, and an anonymous identifier for the session. If you choose to answer "what were you
            doing?" on a crash screen, that answer goes with it. We do not send your email address or name.
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
          Your account and your work stay until you delete them. Deleting a project removes it and its files;
          deleting your account removes your profile, projects, files, comments, likes and follows.
        </p>
        <p>
          A project taken down by a moderator is <em>not</em> deleted — it is forced private, and stays in your
          account. Server logs and error reports are short-lived operational records, not a profile of you.
        </p>
        <p>
          Your account does not expire when you graduate. Alumni keeping their portfolio is a deliberate goal,
          not an oversight.
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
          You can edit or delete any project at any time, change any project's visibility, edit or remove your
          profile details and avatar, and decline any collaborator invitation.
        </p>
        <p>
          To get a copy of your data or delete your account entirely, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your U of T address. There is no
          self-service account deletion yet — it is a real gap, and asking gets it done by a person in the
          meantime.
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
          Passwords, where you set one, are stored as scrypt hashes and are never recoverable in plain text.
          Sessions are signed, HTTP-only cookies. Uploads are checked against their actual bytes rather than
          their filename, so a renamed executable is rejected.
        </p>
        <p>
          None of that makes a student project as hardened as a university system. Treat uofthub as a place to
          publish work, not as the only copy of it, and do not upload anything you are under an obligation to
          keep confidential.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    heading: 'Changes',
    body: (
      <p>
        If this policy changes in a way that affects what happens to your work or who receives it, the change is
        announced in-app before it takes effect. Questions go to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  usePageCrumbs([{ text: 'Privacy', href: '/privacy' }])

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 820 }}>
      <PageHeader title="Privacy" subtitle="What we collect, why, and who else sees it." />

      <Card style={{ padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Icon name="mdi-shield-lock-outline" size={28} color="var(--v-accent-base)" />
        <p style={{ margin: 0 }}>
          The short version: we collect what the platform needs and nothing else, your projects are private until
          you say otherwise, and nobody buys any of it. The companion page on ownership and moderation is{' '}
          <Link to="/terms">Terms &amp; ownership</Link>.
        </p>
      </Card>

      {SECTIONS.map(section => (
        <section key={section.id} id={section.id}>
          <h2 style={{ margin: '40px 0 12px' }}>{section.heading}</h2>
          <div className="text--secondary" style={{ fontSize: '0.9375rem' }}>
            {section.body}
          </div>
        </section>
      ))}

      <p className="text--disabled" style={{ fontSize: '0.8125rem', margin: '40px 0 32px' }}>
        uofthub is a student project and is not officially affiliated with the University of Toronto.
      </p>
    </div>
  )
}
