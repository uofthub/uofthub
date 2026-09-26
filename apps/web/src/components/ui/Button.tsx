import type { ButtonHTMLAttributes, CSSProperties, ElementType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { soonProps } from './soon'
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass'
import { cx } from './cx'
import type { AsProps } from './polymorphic'

type Common = {
  variant?: ButtonVariant
  size?: ButtonSize
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
  state?: unknown
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

/**
 * The design's button in its three shapes: a button, an in-app link, or an
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
  const classes = buttonClass({ variant, size, iconOnly, block, className })
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
        state={props.state}
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

/**
 * A button that reads as a link — "Reply", "Edit", "Clear filters". A
 * <button type="button"> unless `as` says otherwise (a <label> for a file
 * picker).
 */
export function LinkButton<T extends ElementType = 'button'>({
  as,
  className,
  ...rest
}: AsProps<T>) {
  const Tag: ElementType = as ?? 'button'
  return (
    <Tag
      {...(Tag === 'button' && { type: 'button' })}
      className={cx(
        'inline-flex items-center gap-1 text-left text-14 font-semibold text-navy-ink hover:text-navy-deep disabled:cursor-default disabled:opacity-70',
        className
      )}
      {...rest}
    />
  )
}
