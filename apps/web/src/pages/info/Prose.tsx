import type { ReactNode } from 'react'
import { useDocumentTitle } from '../../lib/hooks'
import { Icon, type IconName } from '../../components/ui'
import './info.css'

/** The shared layout of the long-form pages: title, a short version, then sections. */
export function Prose({
  title,
  lede,
  icon,
  summary,
  sections,
  footer,
}: {
  title: string
  lede: string
  icon: IconName
  summary: ReactNode
  sections: { id: string; heading: string; body: ReactNode }[]
  footer: ReactNode
}) {
  useDocumentTitle(title)
  return (
    <div className="page page--narrow prose">
      <h1 className="page-title">{title}</h1>
      <p className="page-lede">{lede}</p>
      <div className="notice notice--navy prose__summary">
        <Icon name={icon} size={22} />
        <p>{summary}</p>
      </div>
      {sections.map((s) => (
        <section key={s.id} id={s.id}>
          <h2 className="h2 prose__h">{s.heading}</h2>
          <div className="prose__body">{s.body}</div>
        </section>
      ))}
      <p className="muted prose__foot">{footer}</p>
    </div>
  )
}
