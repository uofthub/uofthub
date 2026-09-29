import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CONTACT_EMAIL } from '../../lib/site'
import { Prose } from './Prose'

/**
 * Terms of use and the IP position prd.md § 9 requires: "clear terms around
 * ownership/IP — the platform does not claim rights to uploaded work". Plain
 * language on purpose; it is read by students, not lawyers.
 */

const SECTIONS: { id: string; heading: string; body: ReactNode }[] = [
  {
    id: 'ownership',
    heading: 'You own your work',
    body: (
      <>
        <p>
          Everything you upload — code, writing, images, datasets, videos — stays yours. uofthub
          claims no ownership of it, no exclusive rights to it, and no licence to sell it,
          sublicense it, or train models on it.
        </p>
        <p>
          You give us permission to do exactly one thing with your files: store them and show them
          to the people you have chosen to show them to. That permission is the whole point of a
          hosting platform, and it ends when you delete the project or your account.
        </p>
        <p>
          If a project is group work, publishing it here does not settle who owns it between you and
          your collaborators. That is between you — which is why collaborators must accept an
          invitation before they are listed on a project.
        </p>
      </>
    ),
  },
  {
    id: 'visibility',
    heading: 'You control who sees it',
    body: (
      <>
        <p>
          Every project is <strong>Private</strong>, <strong>U of T only</strong>, or{' '}
          <strong>Public</strong>, and it starts private. Nothing you upload becomes visible to
          anyone else because of a default we picked.
        </p>
        <p>
          Files are never served from a public bucket. A download always goes through the API, which
          re-checks the project's visibility first, so a link to a file cannot outlive the
          visibility setting on the project that holds it. TA and professor access is granted by
          you, per project, and never platform-wide.
        </p>
      </>
    ),
  },
  {
    id: 'responsibility',
    heading: 'What you are responsible for',
    body: (
      <>
        <p>Do not publish anything here that:</p>
        <ul>
          <li>
            you do not have the right to publish — someone else's work, or your group's without
            their consent;
          </li>
          <li>
            breaks academic integrity, including solutions to coursework that is still being
            assessed. Check your course's policy before you post work from it;
          </li>
          <li>
            contains personal information about someone who has not agreed to it being published;
          </li>
          <li>harasses, threatens or demeans a person or group;</li>
          <li>is malware, or is spam and advertising dressed up as a project.</li>
        </ul>
        <p>
          Confidential research and work under an NDA is your call to make, not ours — but "Private"
          is the setting for it, and if you are unsure whether you may post something at all, ask
          your supervisor first.
        </p>
      </>
    ),
  },
  {
    id: 'moderation',
    heading: 'Reports and moderation',
    body: (
      <>
        <p>
          Anyone signed in can report a U of T-visible or public project, a comment, a collection, a
          profile or a group event with its <strong>Report</strong> button. Private projects cannot
          be reported — nobody outside the project can see them.
        </p>
        <p>A moderator reads every report and does one of three things:</p>
        <ul>
          <li>
            <strong>Dismisses</strong> it — nothing was wrong. The owner is never told a dismissed
            report existed.
          </li>
          <li>
            <strong>Warns whoever posted it</strong> — it stays up, and they get a notification
            explaining what to fix.
          </li>
          <li>
            <strong>Takes it down</strong> — a project is forced back to private and its owner
            cannot re-open it; nothing is deleted, and the project, its files and its history stay
            in the owner's account. A comment, collection or event is removed. A profile loses its
            bio, links and photo.
          </li>
        </ul>
        <p>
          A conversation can be reported from its <strong>⋯</strong> menu once the other person has
          messaged you. The report carries the last 30 messages between you, and blocks them unless
          you say otherwise. A moderator can dismiss it, warn the sender, or{' '}
          <strong>suspend their messaging</strong> — they can still read their conversations but
          cannot send until a moderator lifts it.
        </p>
        <p>
          Reporting in bad faith — to bury a competitor's project or harass its owner — is itself a
          violation. If a decision about something of yours is wrong, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and a human will look at it again.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    heading: 'Accounts',
    body: (
      <>
        <p>
          An account requires a current U of T address — one ending in <code>utoronto.ca</code>{' '}
          (such as <code>@mail.utoronto.ca</code>) or <code>toronto.edu</code> (such as{' '}
          <code>@cs.toronto.edu</code>) — proven by signing in with Microsoft or following the link
          we email you. That is the only thing we verify — we do not check your program, your year,
          or whether you are still enrolled.
        </p>
        <p>
          We may suspend an account that repeatedly publishes material covered above. A suspended
          account can still sign in, read, download its data and delete itself, but cannot post,
          comment, react, follow or message until a moderator lifts it. We do not delete a student's
          work to make a point: a suspension erases nothing.
        </p>
        <p>
          You can block another student from their profile or a conversation. Neither of you can
          then message, comment on, react to or follow the other. They are not told.
        </p>
      </>
    ),
  },
  {
    id: 'platform',
    heading: 'What we do not promise',
    body: (
      <>
        <p>
          uofthub is a student project, run by students, and is not officially affiliated with the
          University of Toronto. It is provided as-is: there is no uptime guarantee, and it is not a
          backup service. Keep your own copy of anything you would be upset to lose.
        </p>
        <p>
          We do not sell your work or your attention, run ads, or scrape Canvas or any other
          university system. If these terms change in a way that affects what happens to your work,
          the change will be announced in-app before it takes effect.
        </p>
      </>
    ),
  },
]

export default function TermsPage() {
  return (
    <Prose
      title="Terms & ownership"
      lede="What happens to the work you put here, in plain language."
      icon="shieldCheck"
      sections={SECTIONS}
      summary={
        <>
          The short version: <strong>your work stays yours</strong>, it is private until you say
          otherwise, and the only thing we ask is that what you publish is actually yours to
          publish.
        </>
      }
      footer={
        <>
          What we collect and who else sees it is covered separately, on{' '}
          <Link to="/privacy">Privacy</Link>. Questions about any of this?{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </>
      }
    />
  )
}
