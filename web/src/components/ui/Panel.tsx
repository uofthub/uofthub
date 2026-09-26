import type { ReactNode } from 'react'
import { Card } from './Card'
import { cx } from './cx'
import { Heading } from './Type'

type Size = 'rail' | 'main' | 'story'

const SIZE: Record<Size, string> = {
  // A side column's section: 18px heading, 20px padding.
  rail: 'gap-3.5 px-5 py-4.5',
  // A main-column card, roomier and tightening on a phone.
  main: 'gap-4.5 px-4.5 py-5 md:px-7.5 md:py-6.5',
  // The project page's long-form cards — the overview and its sections.
  story: 'gap-4.5 px-8.5 py-7.5',
}

/**
 * A titled card — every rail section on the boards ("Trending this week",
 * "More built for CSC309", "Skills from projects") and the big story and
 * comment cards on the project page are this shape at different sizes.
 */
export function Panel({
  title,
  action,
  size = 'rail',
  className,
  id,
  children,
}: {
  title?: ReactNode
  action?: ReactNode
  size?: Size
  className?: string
  id?: string
  children: ReactNode
}) {
  return (
    <Card as="section" id={id} className={cx('flex flex-col', SIZE[size], className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <Heading className={size === 'rail' ? 'text-18' : undefined}>{title}</Heading>}
          {action}
        </div>
      )}
      {children}
    </Card>
  )
}
