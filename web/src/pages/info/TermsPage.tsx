import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, SOURCE_URL } from '../../lib/site'
import { Prose } from './Prose'

/**
 * Terms of use and the IP position prd.md § 9 requires: "clear terms around
 * ownership/IP — the platform does not claim rights to uploaded work". Plain
 * language on purpose; it is read by students, not lawyers.
 */

const SECTIONS: { id: string; heading: string; body: ReactNode }[] = [
  {
    id: 'agreement',
    heading: 'Agreeing to these terms',
    body: (
      <>
        <p>
          These terms are an agreement between you and the students who run uofthub. By creating an
          account, signing in, or otherwise using uofthub, you agree to them and to the{' '}
          <Link to="/privacy">Privacy policy</Link>. If you do not agree, do not use uofthub.
        </p>
        <p>
          When you create an account you tick a box saying you agree, and we record when you did. If
          these terms change in a way that affects you, we ask you to agree again before you can
          post, comment or message, and we record that too. You can always read the version in force
          on this page; the date at the top is when it last changed.
        </p>
      </>
    ),
  },
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
          visibility setting on the project that holds it. Nobody else — a teammate, a TA, a
          professor — sees a private project unless you invite them to it.
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
          <li>
            is sexually explicit, contains nudity, or sexualises anyone — in a project, a file, an
            image, an avatar, a comment, a link or a message. See{' '}
            <a href="#sexual-content">No sexual content</a>;
          </li>
          <li>harasses, threatens or demeans a person or group;</li>
          <li>is malware, or is spam and advertising dressed up as a project.</li>
        </ul>
        <p>
          Invite only people you actually work with. An invitation to an address that has no account
          yet sends that address one email asking them to join, so please don't use invitations to
          contact strangers.
        </p>
        <p>
          Confidential research and work under an NDA is your call to make, not ours — but "Private"
          is the setting for it, and if you are unsure whether you may post something at all, ask
          your supervisor first.
        </p>
      </>
    ),
  },
  {
    id: 'sexual-content',
    heading: 'No sexual content',
    body: (
      <>
        <p>
          uofthub is for academic and creative work. Sexual content has no place on it, whatever its
          visibility — that includes drafts, private projects and direct messages. This covers
          pornography, nudity, sexual images or video, sexually explicit writing, and anything that
          sexualises a real person, a classmate above all. Work that genuinely studies these
          subjects, such as research on sexual health, is allowed as long as it is not itself
          explicit; if you are unsure, keep it off uofthub.
        </p>
        <p>
          Sending sexual messages or images to someone who has not asked for them is harassment, and
          so is sharing an intimate image of anyone without their consent. Doing the latter is also
          a crime in Canada.
        </p>
        <p>
          <strong>Anything sexual that involves a person under 18 is removed at once</strong>, the
          account that posted it is suspended, and it is reported to the police and to{' '}
          <a href="https://www.cybertip.ca">Cybertip.ca</a>, as Canadian law requires. We keep a
          copy of what we removed, out of everyone's sight, so that it can be handed to them; we do
          not delete evidence.
        </p>
        <p>
          If you come across sexual content here, report it with{' '}
          <strong>Sexual content or nudity</strong>. Those reports go to the top of the moderation
          queue, ahead of everything else. If someone is in danger, call 911 first.
        </p>
      </>
    ),
  },
  {
    id: 'others-content',
    heading: 'What other people post',
    body: (
      <>
        <p>
          Everything on uofthub is posted by its users. We do not review projects, files, comments
          or messages before they appear, and we cannot promise that you will never see something
          that breaks these terms or that you find offensive. Whoever posts something is responsible
          for it — not uofthub, and not the people who run it.
        </p>
        <p>
          What we do promise is to act on what we are told about. Every report is read by a
          moderator, and content that breaks these terms is taken down. If something here upsets
          you, report it and, if you want to stop seeing someone, block them.
        </p>
        <p>
          You agree that you use uofthub, and look at what other people post on it, at your own
          discretion, and that uofthub and the students who run it are not liable to you for content
          another user posted, to the fullest extent the law allows. If something you posted leads
          to a claim against uofthub, you are responsible for it.
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
            bio, links and photo. When the reason is sexual content, an image we take down is kept
            out of sight rather than deleted, as described under{' '}
            <a href="#sexual-content">No sexual content</a>.
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
          We may suspend an account that repeatedly publishes material covered above, and suspend
          one at once for sexual content involving a minor, for sharing intimate images without
          consent, or for anything else serious enough that a warning would not be enough. A
          suspended account can still sign in, read, download its data and delete itself, but cannot
          post, comment, react, follow or message until a moderator lifts it. We do not delete a
          student's work to make a point: a suspension erases nothing.
        </p>
        <p>
          You can block another student from their profile or a conversation. Neither of you can
          then message, comment on, react to or follow the other. They are not told.
        </p>
      </>
    ),
  },
  {
    id: 'limits',
    heading: 'Limits on uploads',
    body: (
      <>
        <p>
          Files are capped by type — 25 MB for documents, images and audio, 100 MB for a zip, 250 MB
          for a video — at 20 files a project. An account's projects can hold 5 GB of files between
          them. That is far more than a portfolio needs; the ceiling is there so nobody can use
          uofthub as free bulk storage.
        </p>
        <p>
          Executables and scripts are never accepted, and neither are the old Office formats (.doc,
          .xls, .ppt), which can carry macros. Save them as .docx, .xlsx or .pptx instead.
        </p>
      </>
    ),
  },
  {
    id: 'open-source',
    heading: 'The code is open source — your work is not',
    body: (
      <>
        <p>
          The software that runs uofthub is free software under the GNU Affero General Public
          License (AGPL-3.0). Anyone can read it, check how it treats your data, and suggest
          changes. <a href={SOURCE_URL}>The source is on GitHub</a>.
        </p>
        <p>
          That licence covers our code and nothing else. It gives nobody any rights to what you
          publish here: your projects, files and writing are still yours alone, as set out under{' '}
          <a href="#ownership">You own your work</a>.
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
          To the fullest extent the law allows, uofthub is provided without warranties of any kind,
          and the students who run it are not liable for any indirect or consequential loss arising
          from your use of it, or for anything posted by other users. Nothing in these terms limits
          a liability that the law does not allow to be limited.
        </p>
        <p>
          We do not sell your work or your attention, run ads, or scrape Canvas or any other
          university system. If these terms change in a way that affects you, the change will be
          announced in-app before it takes effect, and you will be asked to agree to it again.
        </p>
        <p>These terms are governed by the laws of Ontario and of Canada that apply there.</p>
      </>
    ),
  },
]

export default function TermsPage() {
  return (
    <Prose
      title="Terms & ownership"
      lede="What happens to the work you put here, in plain language."
      updated="2026-10-02"
      icon="shieldCheck"
      sections={SECTIONS}
      summary={
        <>
          The short version: <strong>your work stays yours</strong>, it is private until you say
          otherwise, nothing sexual is allowed anywhere on uofthub, and we ask that what you publish
          is actually yours to publish. By using uofthub you agree to these terms.
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
