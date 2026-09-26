import type { ElementType } from 'react'
import { cx } from './cx'
import type { AsProps } from './polymorphic'

/**
 * A section heading in the display face — "Trending this week", a dialog's
 * title. 22px by default; pass a text-* class for the smaller rail and dialog
 * sizes. Renders an <h2> unless `as` says otherwise.
 */
export function Heading<T extends ElementType = 'h2'>({ as, className, ...rest }: AsProps<T>) {
  const Tag: ElementType = as ?? 'h2'
  return (
    <Tag className={cx('font-display text-22 font-bold tracking-tight', className)} {...rest} />
  )
}

/** The small, spaced, uppercase label over a group — "COURSES", "PAGES". */
export function Eyebrow<T extends ElementType = 'p'>({ as, className, ...rest }: AsProps<T>) {
  const Tag: ElementType = as ?? 'p'
  return (
    <Tag
      className={cx('text-12 font-bold tracking-wider text-muted uppercase', className)}
      {...rest}
    />
  )
}

/** A page's own title, at the top of Explore, Collections, About… */
export function PageTitle<T extends ElementType = 'h1'>({
  as,
  size = 'lg',
  className,
  ...rest
}: AsProps<T, { size?: 'lg' | 'xl' }>) {
  const Tag: ElementType = as ?? 'h1'
  return (
    <Tag
      className={cx(
        'font-display text-32 leading-[1.05] font-bold tracking-tightest',
        size === 'xl' ? 'md:text-52' : 'md:text-44',
        className
      )}
      {...rest}
    />
  )
}

/** The sentence under a page title. */
export function PageLede<T extends ElementType = 'p'>({ as, className, ...rest }: AsProps<T>) {
  const Tag: ElementType = as ?? 'p'
  return <Tag className={cx('mt-1.5 text-15 text-ink-3 md:text-17', className)} {...rest} />
}
