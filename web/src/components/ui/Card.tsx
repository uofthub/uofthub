import type { ElementType } from 'react'
import { cx } from './cx'
import type { AsProps } from './polymorphic'

/** The white, hairline-bordered, 16px-rounded surface nearly everything sits on. */
export const card = 'rounded-card border border-line bg-surface'

/**
 * A card. It is a <div> unless `as` says otherwise — a <section>, an
 * <article>, or a router Link for a card that is a link as a whole.
 */
export function Card<T extends ElementType = 'div'>({ as, className, ...rest }: AsProps<T>) {
  const Tag: ElementType = as ?? 'div'
  return <Tag className={cx(card, className)} {...rest} />
}

/**
 * The boards' three-column card grid: two columns on a tablet, one on a phone.
 */
export function CardGrid<T extends ElementType = 'div'>({ as, className, ...rest }: AsProps<T>) {
  const Tag: ElementType = as ?? 'div'
  return (
    <Tag
      className={cx('grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3', className)}
      {...rest}
    />
  )
}
