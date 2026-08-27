import { usePageCrumbs } from '../lib/crumbs'
import { Btn, Card, Icon, PageHeader } from '../components/ui'
import { CONTACT_EMAIL, GITHUB_URL } from '../components/layout/nav'
import Mark from '../components/Mark'

const PRINCIPLES = [
  {
    icon: 'mdi-lock-outline',
    colour: 'blue',
    title: 'You own the visibility',
    text: 'Every project is private, U of T only, or public — set per project and changeable at any time. Nothing is public by default.',
  },
  {
    icon: 'mdi-account-multiple-outline',
    colour: 'mint',
    title: 'Credit where it is due',
    text: 'Group work is the norm here. Collaborators are first-class: the project shows up on every contributor’s profile.',
  },
  {
    icon: 'mdi-code-tags',
    colour: 'purple',
    title: 'Open source',
    text: 'The whole thing is on GitHub. Read the code, file an issue, or send a pull request — it is built in the open.',
  },
  {
    icon: 'mdi-cancel',
    colour: 'orange',
    title: 'No ads, no scraping',
    text: 'We do not sell your work or your attention. Signing in requires a U of T email, and that is the only thing we verify.',
  },
]

export default function AboutPage() {
  usePageCrumbs([{ text: 'About', href: '/about' }])

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 900 }}>
      <PageHeader title="About uofthub" subtitle="Why this exists and who it is for." />

      <Card style={{ padding: 32, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mark size={90} />
        <div style={{ flex: '1 1 320px' }}>
          <p style={{ margin: 0 }}>
            Student work at U of T is scattered across GitHub, Google Drive, Discord, Canvas and personal
            websites. There is no single place to publish and discover what students actually build during their
            time here — especially for students outside computer science, who do not naturally reach for GitHub.
          </p>
          <p style={{ marginBottom: 0, marginTop: 16 }}>
            uofthub is a social layer for student-made work: upload a project, link the repo, add collaborators,
            and share it with however much of the world you want.
          </p>
        </div>
      </Card>

      <h2 style={{ margin: '48px 0 20px' }}>What we care about</h2>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {PRINCIPLES.map(p => (
          <Card key={p.title} style={{ padding: 24 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `var(--tone-${p.colour})`,
              }}
            >
              <Icon name={p.icon} size={24} color="#fff" />
            </div>
            <h3 style={{ marginTop: 16, fontSize: '1.125rem' }}>{p.title}</h3>
            <p className="text--secondary" style={{ margin: '8px 0 0', fontSize: '0.9375rem' }}>
              {p.text}
            </p>
          </Card>
        ))}
      </div>

      <h2 style={{ margin: '48px 0 12px' }}>Get in touch</h2>
      <p className="text--secondary">
        Found a bug, want a feature, or want to help build it? The fastest route is a GitHub issue.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16, marginBottom: 32 }}>
        <Btn variant="accent" href={`${GITHUB_URL}/issues`} target="_blank">
          <Icon name="mdi-github" color="#fff" />
          Open an issue
        </Btn>
        <Btn variant="outlined" href={`mailto:${CONTACT_EMAIL}`}>
          <Icon name="mdi-email-outline" />
          {CONTACT_EMAIL}
        </Btn>
      </div>

      <p className="text--disabled" style={{ fontSize: '0.8125rem' }}>
        uofthub is a student project and is not officially affiliated with the University of Toronto.
      </p>
    </div>
  )
}
