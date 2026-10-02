import type { ReactNode } from 'react'
import { useDocumentTitle } from '../../lib/hooks'
import { cx, Heading, Notice, Page, PageLede, PageTitle, type IconName } from '../../components/ui'

/**
 * The sections' running text. Their bodies are plain paragraphs and lists
 * written inline in TermsPage and PrivacyPage, so the spacing is set here
 * once rather than on each of them.
 */
const body = cx(
  'text-16 leading-[1.65] text-ink-2',
  '[&_ol]:mb-3.5 [&_ol]:list-decimal [&_ol]:pl-5.5 [&_p]:mb-3.5 [&_ul]:mb-3.5 [&_ul]:list-disc [&_ul]:pl-5.5',
  '[&_li]:mb-1.5'
)

/**
 * When a page's content last changed, as a YYYY-MM-DD date. Set by hand when
 * the wording changes, not from the build, so a refactor doesn't bump it.
 */
export function LastUpdated({ date, className }: { date: string; className?: string }) {
  const label = new Date(date).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return (
    <p className={cx('text-14 text-muted', className)}>
      Last updated <time dateTime={date}>{label}</time>
    </p>
  )
}

/** The shared layout of the long-form pages: title, a short version, then sections. */
export function Prose({
  title,
  lede,
  updated,
  icon,
  summary,
  sections,
  footer,
}: {
  title: string
  lede: string
  updated: string
  icon: IconName
  summary: ReactNode
  sections: { id: string; heading: string; body: ReactNode }[]
  footer: ReactNode
}) {
  useDocumentTitle(title)
  return (
    <Page width="narrow" className="pt-10 md:pt-10 lg:pt-10">
      <PageTitle>{title}</PageTitle>
      <PageLede>{lede}</PageLede>
      <LastUpdated date={updated} className="mt-2" />
      <Notice tone="navy" icon={icon} iconSize={22} className="mt-6">
        <p className="text-16 text-ink">{summary}</p>
      </Notice>
      {sections.map((s) => (
        <section key={s.id} id={s.id}>
          <Heading className="mt-10 mb-3">{s.heading}</Heading>
          <div className={body}>{s.body}</div>
        </section>
      ))}
      <p className="mt-10 mb-4 text-14 text-muted">{footer}</p>
    </Page>
  )
}
