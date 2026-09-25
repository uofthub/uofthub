import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'

/**
 * A titled card — every rail section on the boards ("Trending this week",
 * "More built for CSC309", "Skills from projects") and the big story and
 * comment cards on the project page are this shape at different sizes.
 */
export function Panel({
  title,
  action,
  size = 'rail',
  gap,
  className,
  style,
  id,
  children,
}: {
  title?: ReactNode
  action?: ReactNode
  /** rail: 18px heading, 20px padding. main: 22px heading, roomier. */
  size?: 'rail' | 'main'
  gap?: number
  className?: string
  style?: CSSProperties
  id?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={cx('card', 'panel', `panel--${size}`, className)}
      style={{ gap, ...style }}
    >
      {(title || action) && (
        <div className="panel__head">
          {title && (
            <h2 className="h2" style={size === 'rail' ? { fontSize: 18 } : undefined}>
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
