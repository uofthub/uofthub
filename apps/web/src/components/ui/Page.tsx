import type { ElementType } from 'react'
import { cx } from './cx'
import type { AsProps } from './polymorphic'

type Width = 'default' | 'wide' | 'narrow'

const WIDTH: Record<Width, string> = {
  default: 'lg:px-10 lg:pt-7 lg:pb-14',
  // The directory pages (Explore, Collections…) breathe more at desktop.
  wide: 'lg:px-16 lg:pt-11 lg:pb-16',
  // Reading pages: About, Terms, the moderation queue.
  narrow: 'max-w-[880px] lg:px-10 lg:pt-7 lg:pb-14',
}

/** A page's body inside the shell: centred, capped at 1440px, padded to the viewport. */
export function Page<T extends ElementType = 'div'>({
  as,
  width = 'default',
  className,
  ...rest
}: AsProps<T, { width?: Width }>) {
  const Tag: ElementType = as ?? 'div'
  return (
    <Tag
      className={cx(
        'mx-auto w-full max-w-[1440px] px-3 pt-4 pb-8 md:px-5 md:pt-6 md:pb-12',
        WIDTH[width],
        className
      )}
      {...rest}
    />
  )
}
