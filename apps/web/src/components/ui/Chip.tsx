import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { soonProps } from './soon'

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
  soon?: boolean | string
}

/** The design's rounded `.chip`: tags, filters, courses and "open to" labels. */
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
  soon,
}: ChipProps) {
  const classes = cx(
    'chip',
    tone !== 'default' && `chip--${tone}`,
    size !== 'md' && `chip--${size}`,
    className
  )
  const content = (
    <>
      {icon && <Icon name={icon} size={size === 'md' ? 14 : 12} />}
      {children}
    </>
  )

  if (soon) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        {...soonProps(typeof soon === 'string' ? soon : undefined)}
      >
        {content}
      </button>
    )
  }
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
  style,
}: {
  bg: string
  ink: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <span className="badge" style={{ background: bg, color: ink, ...style }}>
      {children}
    </span>
  )
}

/** The outlined status pill with a coloured dot — "● Finished". */
export function Pill({
  dot,
  children,
  style,
}: {
  dot: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <span className="pill" style={style}>
      <i style={{ background: dot }} />
      {children}
    </span>
  )
}
