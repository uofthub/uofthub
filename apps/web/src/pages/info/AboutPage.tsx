import { useDocumentTitle } from '../../lib/hooks'
import { CONTACT_EMAIL, GITHUB_URL } from '../../lib/site'
import { Button, Icon, type IconName } from '../../components/ui'
import './info.css'

const PRINCIPLES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'lock',
    title: 'You own the visibility',
    text: 'Every project is public, U of T only, or a draft — set per project and changeable any time. Nothing is public by default.',
  },
  {
    icon: 'users',
    title: 'Credit where it’s due',
    text: 'Group work is the norm here. A project shows up on every collaborator’s profile once they accept.',
  },
  {
    icon: 'code',
    title: 'Open source',
    text: 'The whole thing is on GitHub. Read the code, file an issue, or send a pull request.',
  },
  {
    icon: 'shieldCheck',
    title: 'No ads, no scraping',
    text: 'We don’t sell your work or your attention. A U of T email is the only thing we verify.',
  },
]

export default function AboutPage() {
  useDocumentTitle('About')
  return (
    <div className="page page--narrow stack" style={{ gap: 32, paddingTop: 40 }}>
      <div>
        <h1 className="page-title">About uofthub</h1>
        <p className="page-lede">Why this exists and who it’s for.</p>
      </div>

      <section className="spotlight" style={{ padding: 28 }}>
        <div className="stack" style={{ gap: 12 }}>
          <span className="spotlight__kicker">
            <Icon name="star" size={15} />
            Made by U of T students, for U of T students
          </span>
          <p style={{ fontSize: 17, lineHeight: 1.6 }}>
            Student work at U of T is scattered across GitHub, Drive, Discord, Quercus and personal
            sites. There’s no one place to share and discover what students actually make here —
            especially for anyone outside computer science, who doesn’t naturally reach for GitHub.
          </p>
          <p className="spotlight__text" style={{ fontSize: 16 }}>
            uofthub is that place: post a project, link the live demo or the repo, credit your
            collaborators, and show it to as much of the world as you want.
          </p>
        </div>
      </section>

      <section className="stack" style={{ gap: 16 }}>
        <h2 className="h2">What we care about</h2>
        <div
          className="promises"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        >
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="card promise">
              <span className="promise__icon">
                <Icon name={p.icon} size={20} />
              </span>
              <h3 className="disp" style={{ fontSize: 19 }}>
                {p.title}
              </h3>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                {p.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="stack" style={{ gap: 12 }}>
        <h2 className="h2">Get in touch</h2>
        <p className="muted" style={{ fontSize: 15 }}>
          Found a bug, want a feature, or want to help build it? A GitHub issue is the fastest
          route.
        </p>
        <div className="row wrap" style={{ gap: 10 }}>
          <Button variant="primary" icon="branch" href={`${GITHUB_URL}/issues`}>
            Open an issue
          </Button>
          <Button icon="mail" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </Button>
        </div>
      </section>

      <p className="muted" style={{ fontSize: 13 }}>
        uofthub is a student project and is not officially affiliated with the University of
        Toronto.
      </p>
    </div>
  )
}
