import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePageCrumbs } from '../lib/crumbs'
import { Card, Icon, PageHeader } from '../components/ui'
import { CONTACT_EMAIL } from '../components/layout/nav'

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
          Everything you upload — code, writing, images, datasets, videos — stays yours. uofthub claims no ownership
          of it, no exclusive rights to it, and no licence to sell it, sublicense it, or train models on it.
        </p>
        <p>
          You give us permission to do exactly one thing with your files: store them and show them to the people you
          have chosen to show them to. That permission is the whole point of a hosting platform, and it ends when
          you delete the project or your account.
        </p>
        <p>
          If a project is group work, publishing it here does not settle who owns it between you and your
          collaborators. That is between you — which is why collaborators must accept an invitation before they are
          listed on a project.
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
          Every project is <strong>Private</strong>, <strong>U of T only</strong>, or <strong>Public</strong>, and it
          starts private. Nothing you upload becomes visible to anyone else because of a default we picked.
        </p>
        <p>
          Files are never served from a public bucket. A download always goes through the API, which re-checks the
          project's visibility first, so a link to a file cannot outlive the visibility setting on the project that
          holds it. TA and professor access is granted by you, per project, and never platform-wide.
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
          <li>you do not have the right to publish — someone else's work, or your group's without their consent;</li>
          <li>
            breaks academic integrity, including solutions to coursework that is still being assessed. Check your
            course's policy before you post work from it;
          </li>
          <li>contains personal information about someone who has not agreed to it being published;</li>
          <li>harasses, threatens or demeans a person or group;</li>
          <li>is malware, or is spam and advertising dressed up as a project.</li>
        </ul>
        <p>
          Confidential research and work under an NDA is your call to make, not ours — but "Private" is the setting
          for it, and if you are unsure whether you may post something at all, ask your supervisor first.
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
          Anyone signed in can report a U of T-visible or public project with the <strong>Report</strong> button on
          the project page. Private projects cannot be reported — nobody outside the project can see them.
        </p>
        <p>A moderator reads every report and does one of three things:</p>
        <ul>
          <li>
            <strong>Dismisses</strong> it — nothing was wrong. The owner is never told a dismissed report existed.
          </li>
          <li>
            <strong>Warns the owner</strong> — the project stays up, and the owner gets a notification explaining
            what to fix.
          </li>
          <li>
            <strong>Takes the project down</strong> — visibility is forced back to private and the owner cannot
            re-open it. Nothing is deleted: the project, its files and its history stay in the owner's account.
          </li>
        </ul>
        <p>
          Reporting in bad faith — to bury a competitor's project or harass its owner — is itself a violation. If a
          decision on your project is wrong, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and a
          human will look at it again.
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
          An account requires a current <code>@mail.utoronto.ca</code> or <code>@utoronto.ca</code> address. That is
          the only thing we verify — we do not check your program, your year, or whether you are still enrolled.
        </p>
        <p>
          We may suspend an account that repeatedly publishes material covered above. We do not delete a student's
          work to make a point: a suspension makes projects private, it does not erase them.
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
          uofthub is a student project, run by students, and is not officially affiliated with the University of
          Toronto. It is provided as-is: there is no uptime guarantee, and it is not a backup service. Keep your own
          copy of anything you would be upset to lose.
        </p>
        <p>
          We do not sell your work or your attention, run ads, or scrape Canvas or any other university system. If
          these terms change in a way that affects what happens to your work, the change will be announced in-app
          before it takes effect.
        </p>
      </>
    ),
  },
]

export default function TermsPage() {
  usePageCrumbs([{ text: 'Terms', href: '/terms' }])

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 820 }}>
      <PageHeader
        title="Terms & ownership"
        subtitle="What happens to the work you put here, in plain language."
      />

      <Card style={{ padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Icon name="mdi-shield-check-outline" size={28} color="var(--v-accent-base)" />
        <p style={{ margin: 0 }}>
          The short version: <strong>your work stays yours</strong>, it is private until you say otherwise, and the
          only thing we ask is that what you publish is actually yours to publish.
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
        What we collect and who else sees it is covered separately, on <Link to="/privacy">Privacy</Link>.
        Questions about any of this? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </div>
  )
}
