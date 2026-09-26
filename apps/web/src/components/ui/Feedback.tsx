import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { soonProps } from './soon'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-12 text-14" role="status">
      <span
        className="size-5.5 animate-spin rounded-full border-3 border-navy-tint border-t-navy-ink"
        aria-hidden="true"
      />
      <span className="text-muted">{label}</span>
    </div>
  )
}

/** A quiet, centred "nothing here" with an optional way forward. */
export function EmptyState({
  icon = 'layers',
  title,
  children,
  action,
  compact,
}: {
  icon?: IconName
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center gap-2.5 text-center',
        compact ? 'px-2 py-5' : 'px-5 py-11'
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-navy-tint text-navy-ink">
        <Icon name={icon} size={22} />
      </span>
      <div className="max-w-[44ch] text-16 font-semibold">{title}</div>
      {children && <p className="max-w-[52ch] text-14 leading-normal text-muted">{children}</p>}
      {action && <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">{action}</div>}
    </div>
  )
}

export function ErrorText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('flex items-center gap-1.5 text-14 text-red', className)} role="alert">
      <Icon name="alert" size={16} />
      {children}
    </p>
  )
}

/** The green "done" line a dialog shows once its request has gone through. */
export function SuccessText({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-green-ink" role="status">
      <Icon name="check" />
      {children}
    </p>
  )
}

type NoticeTone = 'plain' | 'danger' | 'gold' | 'navy'

const NOTICE_TONE: Record<NoticeTone, string> = {
  plain: '',
  danger: 'bg-red-tint text-red',
  gold: 'bg-gold-tint text-gold-ink',
  navy: 'bg-navy-tint text-navy-ink',
}

/**
 * A tinted box that tells the student something about the page they are on —
 * a takedown, a template, what didn't save. The icon and title take the tone's
 * ink; the body stays readable grey.
 */
export function Notice({
  tone = 'plain',
  icon,
  iconSize = 20,
  title,
  action,
  className,
  children,
}: {
  tone?: NoticeTone
  icon?: IconName
  iconSize?: number
  title?: ReactNode
  /** A button at the end of the row, like "Use it". */
  action?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cx(
        'flex items-start gap-3 rounded-xl px-4.5 py-4 text-15 leading-normal',
        NOTICE_TONE[tone],
        className
      )}
    >
      {icon && <Icon name={icon} size={iconSize} />}
      <div className="min-w-0 grow">
        {title && <b className="text-ink">{title}</b>}
        {children && <div className={cx(title && 'mt-1', 'text-ink-3')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

/** The design's switch, as in "Only projects looking for help". */
export function Toggle({
  checked,
  onChange,
  children,
  soon,
}: {
  checked: boolean
  onChange?: (checked: boolean) => void
  children: ReactNode
  soon?: boolean | string
}) {
  return (
    <label
      className="group inline-flex cursor-pointer items-center gap-2.5 text-15 font-semibold"
      {...(soon ? soonProps(typeof soon === 'string' ? soon : undefined) : {})}
    >
      <span
        className={cx(
          'relative inline-block h-6.5 w-11 rounded-full transition-colors duration-150',
          'group-has-focus-visible:outline-2 group-has-focus-visible:outline-offset-2 group-has-focus-visible:outline-navy',
          checked ? 'bg-navy' : 'bg-line-strong'
        )}
        aria-hidden="true"
      >
        <span
          className={cx(
            'absolute top-0.75 left-0.75 size-5 rounded-full bg-white transition-transform duration-150',
            checked && 'translate-x-4.5'
          )}
        />
      </span>
      {children}
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={!!soon}
        onChange={(e) => onChange?.(e.target.checked)}
      />
    </label>
  )
}
