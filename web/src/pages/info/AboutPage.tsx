import { useDocumentTitle } from '../../lib/hooks'
import { CONTACT_EMAIL, GITHUB_URL } from '../../lib/site'
import {
  Banner,
  BannerKicker,
  Button,
  Card,
  Heading,
  Icon,
  Page,
  PageLede,
  PageTitle,
  type IconName,
} from '../../components/ui'

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
    text: 'Free software under the AGPL, on GitHub. Read the code, follow the roadmap, or send a pull request.',
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
    <Page width="narrow" className="flex flex-col gap-8 pt-10 md:pt-10 lg:pt-10">
      <div>
        <PageTitle>About uofthub</PageTitle>
        <PageLede>Why this exists and who it’s for.</PageLede>
      </div>

      <Banner className="p-7">
        <div className="flex flex-col gap-3">
          <BannerKicker icon="star">Made by U of T students, for U of T students</BannerKicker>
          <p className="text-17 leading-[1.6]">
            Student work at U of T is scattered across GitHub, Drive, Discord, Quercus and personal
            sites. There’s no one place to share and discover what students actually make here —
            especially for anyone outside computer science, who doesn’t naturally reach for GitHub.
          </p>
          <p className="text-16 leading-normal text-navy-text">
            uofthub is that place: post a project, link the live demo or the repo, credit your
            collaborators, and show it to as much of the world as you want.
          </p>
        </div>
      </Banner>

      <section className="flex flex-col gap-4">
        <Heading>What we care about</Heading>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
          {PRINCIPLES.map((p) => (
            <Card key={p.title} className="flex flex-col gap-2.5 p-5.5">
              <span className="flex size-10 items-center justify-center rounded-btn bg-navy-tint text-navy-ink">
                <Icon name={p.icon} size={20} />
              </span>
              <h3 className="font-display text-19 font-bold">{p.title}</h3>
              <p className="text-14 leading-normal text-muted">{p.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Heading>Get in touch</Heading>
        <p className="text-15 text-muted">
          Found a bug, want a feature, or want to help build it? Tell us — every message is read by
          a person.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" icon="megaphone" to="/feedback">
            Send feedback
          </Button>
          <Button icon="branch" href={GITHUB_URL}>
            uofthub on GitHub
          </Button>
          <Button icon="mail" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </Button>
        </div>
      </section>

      <p className="text-13 text-muted">
        uofthub is a student project and is not officially affiliated with the University of
        Toronto.
      </p>
    </Page>
  )
}
