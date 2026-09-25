import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { soonProps } from './soon'
import { cx } from './cx'

type Variant = 'default' | 'primary' | 'gold' | 'ghost' | 'danger'
/** lg is the design's 44px default; md is the 40px in-card size; sm is 36px. */
type Size = 'lg' | 'md' | 'sm'

type Common = {
  variant?: Variant
  size?: Size
  icon?: IconName
  iconSize?: number
  /** Square, icon only. Needs an aria-label. */
  iconOnly?: boolean
  block?: boolean
  /** Designed but not backed by the API yet — see soon.ts. */
  soon?: boolean | string
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

type AsButton = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> & {
    to?: never
    href?: never
  }
type AsRoute = Common & {
  to: string
  href?: never
  'aria-label'?: string
  title?: string
  onClick?: () => void
}
type AsAnchor = Common & {
  href: string
  to?: never
  'aria-label'?: string
  title?: string
  download?: boolean
}

export type ButtonProps = AsButton | AsRoute | AsAnchor

const VARIANT: Record<Variant, string | undefined> = {
  default: undefined,
  primary: 'btn-p',
  gold: 'btn--gold',
  ghost: 'btn--ghost',
  danger: 'btn--danger',
}

/**
 * The design's `.btn` in its three shapes: a button, an in-app link, or an
 * external link (which always opens safely in a new tab).
 */
export function Button(props: ButtonProps) {
  const {
    variant = 'default',
    size = 'lg',
    icon,
    iconSize,
    iconOnly,
    block,
    soon,
    className,
    style,
    children,
  } = props
  const classes = cx(
    'btn',
    VARIANT[variant],
    size !== 'lg' && `btn--${size}`,
    iconOnly && 'btn--icon',
    block && 'btn--block',
    className
  )
  const content = (
    <>
      {icon && <Icon name={icon} size={iconSize ?? (size === 'lg' ? 18 : 16)} />}
      {children}
    </>
  )

  if (soon) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        aria-label={(props as AsButton)['aria-label']}
        {...soonProps(typeof soon === 'string' ? soon : undefined)}
      >
        {content}
      </button>
    )
  }

  if ('to' in props && props.to !== undefined) {
    return (
      <Link
        to={props.to}
        className={classes}
        style={style}
        aria-label={props['aria-label']}
        title={props.title}
        onClick={props.onClick}
      >
        {content}
      </Link>
    )
  }

  if ('href' in props && props.href !== undefined) {
    return (
      <a
        href={props.href}
        className={classes}
        style={style}
        aria-label={props['aria-label']}
        title={props.title}
        target="_blank"
        rel="noopener noreferrer"
        download={props.download}
      >
        {content}
      </a>
    )
  }

  const rest = { ...(props as AsButton) }
  for (const key of [
    'variant',
    'size',
    'icon',
    'iconSize',
    'iconOnly',
    'block',
    'soon',
    'className',
    'style',
    'children',
  ] as const) {
    delete rest[key]
  }
  return (
    <button type="button" {...rest} className={classes} style={style}>
      {content}
    </button>
  )
}
