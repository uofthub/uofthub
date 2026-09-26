import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'

/**
 * One item in a moderation queue: what it is (a link), its tags, when it came
 * in, who is involved, then whatever the moderator reads and decides with.
 */
export function QueueCard({
  to,
  title,
  tags,
  when,
  meta,
  children,
}: {
  to: string
  title: ReactNode
  tags: ReactNode
  when: ReactNode
  meta: ReactNode
  children: ReactNode
}) {
  return (
    <Card as="article" className="flex flex-col gap-3 p-5.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Link to={to} className="font-display text-19 font-bold">
          {title}
        </Link>
        {tags}
        <span className="ml-auto text-13 text-muted">{when}</span>
      </div>
      <div className="text-13 text-muted">{meta}</div>
      {children}
    </Card>
  )
}

/** The reporter's own words, quoted as written. */
export function Quote({ children }: { children: ReactNode }) {
  return <p className="text-15 whitespace-pre-wrap">“{children}”</p>
}

/** The row of decision buttons under an open item. */
export function Decisions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}
