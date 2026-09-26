import type { ElementType } from 'react'
import { cx } from './cx'
import type { AsProps } from './polymorphic'

/**
 * The round-ended outline button under a project — a reaction, the comment
 * count, the composer's quick actions. `aria-pressed` fills it navy. `bare` is
 * the borderless 40px square for a "more" menu beside them.
 *
 * A <button type="button"> unless `as` says otherwise (a router Link).
 */
export function PillButton<T extends ElementType = 'button'>({
  as,
  bare,
  className,
  ...rest
}: AsProps<T, { bare?: boolean }>) {
  const Tag: ElementType = as ?? 'button'
  return (
    <Tag
      {...(Tag === 'button' && { type: 'button' })}
      className={cx(
        'inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-14 font-medium whitespace-nowrap text-ink-3',
        'hover:border-line-strong hover:text-ink disabled:cursor-default',
        'aria-pressed:border-navy-soft aria-pressed:bg-navy-tint aria-pressed:text-navy-ink aria-pressed:hover:text-navy-ink',
        bare && 'w-10 justify-center border-transparent px-0',
        className
      )}
      {...rest}
    />
  )
}
