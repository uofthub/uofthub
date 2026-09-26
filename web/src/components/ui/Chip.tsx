import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

type ChipTone = 'default' | 'subtle' | 'outline' | 'active' | 'navy' | 'green'
type ChipSize = 'md' | 'sm' | 'xs'

type ChipProps = {
  tone?: ChipTone
  size?: ChipSize
  icon?: IconName
  className?: string
  style?: CSSProperties
  children: ReactNode
  /** Makes it an in-app link. */
  to?: string
  /** Makes it a toggle button. */
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
  pressed?: boolean
}

const TONE: Record<ChipTone, string> = {
  default: 'bg-fill-soft text-ink-3',
  subtle: 'bg-fill text-ink-3',
  outline: 'border border-line bg-surface text-ink-3',
  active: 'bg-navy text-white',
  navy: 'bg-navy-tint text-navy-ink',
  green: 'bg-green-tint text-green-ink',
}

const SIZE: Record<ChipSize, string> = {
  md: 'h-7 px-2.75 text-13',
  sm: 'h-6 px-2.75 text-12',
  xs: 'h-5.5 px-2 text-11',
}

/** The design's rounded chip: tags, filters, courses and "open to" labels. */
export function Chip({
  tone = 'default',
  size = 'md',
  icon,
  className,
  style,
  children,
  to,
  onClick,
  pressed,
}: ChipProps) {
  const classes = cx(
    'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
    TONE[tone],
    SIZE[size],
    to && 'hover:brightness-97',
    onClick && 'enabled:hover:brightness-97',
    className
  )
  const content = (
    <>
      {icon && <Icon name={icon} size={size === 'md' ? 14 : 12} />}
      {children}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classes} style={style}>
        {content}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        aria-pressed={pressed}
      >
        {content}
      </button>
    )
  }
  return (
    <span className={classes} style={style}>
      {content}
    </span>
  )
}

/** The small uppercase type badge — "APP", "RESEARCH" — in its own tint. */
export function Badge({
  bg,
  ink,
  children,
  className,
  style,
}: {
  bg: string
  ink: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={cx(
        'inline-flex h-5.5 items-center rounded-md px-2 text-11 font-bold tracking-wide uppercase',
        className
      )}
      style={{ background: bg, color: ink, ...style }}
    >
      {children}
    </span>
  )
}

/**
 * The outlined status pill with a coloured dot — "● Finished". Given an
 * onClick it is a toggle, outlined navy while pressed: the editor's status
 * picker.
 */
export function Pill({
  dot,
  children,
  className,
  style,
  onClick,
  pressed,
}: {
  dot: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: () => void
  pressed?: boolean
}) {
  const classes = cx(
    'inline-flex h-6.5 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 text-12 font-semibold whitespace-nowrap text-ink-3',
    pressed && 'border-navy-ink text-ink shadow-[inset_0_0_0_1px_var(--color-navy-ink)]',
    className
  )
  const content = (
    <>
      <i className="inline-block size-1.75 rounded-full" style={{ background: dot }} />
      {children}
    </>
  )
  return onClick ? (
    <button
      type="button"
      className={classes}
      style={style}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className={classes} style={style}>
      {content}
    </span>
  )
}
