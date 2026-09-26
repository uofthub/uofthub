import type { ElementType } from 'react'
import { cx } from '../ui'
import type { AsProps } from '../ui/polymorphic'

/** A key hint — "/", "⌘K", "ESC" — as a small outlined cap. */
export function Kbd<T extends ElementType = 'kbd'>({ as, className, ...rest }: AsProps<T>) {
  const Tag: ElementType = as ?? 'kbd'
  return (
    <Tag
      className={cx(
        'rounded-md border border-line-strong bg-surface px-1.75 py-px font-body text-12',
        className
      )}
      {...rest}
    />
  )
}
