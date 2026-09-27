import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

type Tone = 'gold' | 'navy' | 'danger'

const TONE: Record<Tone, string> = {
  gold: 'bg-gold-tint text-gold-ink',
  navy: 'bg-navy-tint text-navy-ink',
  danger: 'bg-red-tint text-red',
}

/**
 * A slim strip across the top of the site for something true of every page —
 * being offline, say. It stays until the thing is resolved or the student
 * closes it. Something about one page belongs in a Notice on that page.
 */
export function StatusBanner({
  tone = 'gold',
  icon = 'info',
  onDismiss,
  className,
  children,
}: {
  tone?: Tone
  icon?: IconName
  onDismiss?: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cx(
        'flex items-center justify-center gap-2.5 border-b border-line px-4 py-2 text-14 motion-safe:animate-fade-in',
        TONE[tone],
        className
      )}
      role="status"
    >
      <Icon name={icon} size={16} className="shrink-0" />
      <span className="min-w-0 leading-snug text-ink-2">{children}</span>
      {onDismiss && (
        <button
          type="button"
          className="-my-1 ml-1 flex size-7 shrink-0 items-center justify-center rounded-md opacity-70 hover:bg-black/5 hover:opacity-100"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}
