import type { ElementType, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import type { AsProps } from './polymorphic'

/**
 * The navy block with white type — the feed's weekly spotlight, the About
 * page's opening. A <section> unless `as` says otherwise; padding is the
 * caller's.
 */
export function Banner<T extends ElementType = 'section'>({ as, className, ...rest }: AsProps<T>) {
  const Tag: ElementType = as ?? 'section'
  return <Tag className={cx('rounded-[18px] bg-panel text-white', className)} {...rest} />
}

/** The small gold uppercase line that opens a Banner. */
export function BannerKicker({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-12 font-bold tracking-wider text-gold uppercase">
      <Icon name={icon} size={15} />
      {children}
    </span>
  )
}
