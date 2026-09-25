import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { soonProps } from './soon'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner__ring" aria-hidden="true" />
      <span className="muted">{label}</span>
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
    <div className={compact ? 'empty empty--compact' : 'empty'}>
      <span className="empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="empty__title">{title}</div>
      {children && <p className="empty__body muted">{children}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="error-text" role="alert">
      <Icon name="alert" size={16} />
      {children}
    </p>
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
      className="toggle"
      {...(soon ? soonProps(typeof soon === 'string' ? soon : undefined) : {})}
    >
      <span
        className={checked ? 'toggle__track toggle__track--on' : 'toggle__track'}
        aria-hidden="true"
      >
        <span className="toggle__knob" />
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
