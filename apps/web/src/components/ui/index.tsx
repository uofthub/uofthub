/**
 * A small Vuetify-flavoured component kit.
 *
 * These mirror the Vuetify primitives uoftindex.ca is built from (v-btn, v-card,
 * v-chip, v-avatar, v-menu, v-dialog, …) so pages read the same way. Styling
 * lives in index.css under the matching `.v-*` class names.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

/* -------------------------------------------------------------------------- */
/* Icon                                                                       */
/* -------------------------------------------------------------------------- */

export type IconProps = {
  /** Material Design Icons name, e.g. `mdi-magnify`. */
  name: string
  size?: number | string
  color?: string
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 20, color, className, style }: IconProps) {
  return (
    <i
      aria-hidden="true"
      className={cx('mdi', name, className)}
      style={{ fontSize: size, lineHeight: 1, color, display: 'inline-flex', ...style }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type BtnVariant = 'text' | 'accent' | 'outlined' | 'error'

type BtnOwnProps = {
  variant?: BtnVariant
  size?: 'small' | 'default' | 'large'
  icon?: boolean
  block?: boolean
  to?: string
  href?: string
  target?: string
  children?: ReactNode
}

export function Btn({
  variant = 'text',
  size = 'default',
  icon,
  block,
  to,
  href,
  target,
  className,
  children,
  ...rest
}: BtnOwnProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cx(
    'v-btn',
    variant === 'accent' && 'v-btn--accent',
    variant === 'outlined' && 'v-btn--outlined',
    variant === 'error' && 'v-btn--error',
    size === 'small' && 'v-btn--small',
    size === 'large' && 'v-btn--large',
    icon && 'v-btn--icon',
    block && 'v-btn--block',
    className,
  )

  if (to) {
    return (
      <Link to={to} className={classes} style={rest.style}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        className={classes}
        style={rest.style}
      >
        {children}
      </a>
    )
  }
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export function Card({
  hover,
  flat,
  to,
  className,
  style,
  children,
  onClick,
}: {
  hover?: boolean
  flat?: boolean
  to?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
  onClick?: () => void
}) {
  const classes = cx('v-card', flat && 'v-card--flat', hover && 'v-card--hover', className)
  if (to) {
    return (
      <Link to={to} className={classes} style={{ display: 'block', color: 'inherit', ...style }}>
        {children}
      </Link>
    )
  }
  return (
    <div className={classes} style={style} onClick={onClick}>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Chip                                                                       */
/* -------------------------------------------------------------------------- */

/** Palette names available as `--v-{name}-base` pairs in the theme. */
export type ChipColor =
  | 'red'
  | 'orange'
  | 'blue'
  | 'green'
  | 'grey'
  | 'purple'
  | 'mint'
  | 'pink'
  | 'yellow'
  | 'accent'
  | 'success'
  | 'error'
  | 'warning'

export function Chip({
  color = 'grey',
  small,
  label,
  solid,
  clickable,
  onClick,
  className,
  style,
  children,
}: {
  color?: ChipColor
  small?: boolean
  label?: boolean
  /** Filled with the palette colour instead of a 20%-opacity tint. */
  solid?: boolean
  /** Show the hover affordance without owning the click (e.g. inside a link). */
  clickable?: boolean
  onClick?: () => void
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  // `--tone-*` resolves to whichever half of the palette pair is legible on the
  // active theme's background, so the same formula works in light and dark.
  const base = `var(--tone-${color})`
  const tone: CSSProperties = solid
    ? { backgroundColor: base, color: '#fff' }
    : { backgroundColor: `color-mix(in srgb, ${base} 20%, transparent)`, color: base }

  return (
    <span
      className={cx(
        'v-chip',
        small && 'v-chip--small',
        label && 'v-chip--label',
        (onClick || clickable) && 'v-chip--clickable',
        className,
      )}
      style={{ ...tone, ...style }}
      onClick={onClick}
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */

export function Avatar({
  name,
  img,
  size = 36,
  to,
  className,
}: {
  name?: string
  img?: string
  size?: number
  to?: string
  className?: string
}) {
  const initials = (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]!.toUpperCase())
    .join('')

  const inner = (
    <span
      className={cx('v-avatar', className)}
      style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}
    >
      {img ? <img src={img} alt="" /> : initials || '?'}
    </span>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

export function Field({ label, children, hint }: { label?: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      {label && <span className="v-label">{label}</span>}
      {children}
      {hint && <p className="text--disabled" style={{ fontSize: '0.75rem', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  )
}

export function TextField({
  prependIcon,
  appendIcon,
  rounded,
  className,
  inputRef,
  ...rest
}: {
  prependIcon?: string
  appendIcon?: ReactNode
  rounded?: boolean
  inputRef?: Ref<HTMLInputElement>
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx('v-field', rounded && 'v-field--rounded', className)}>
      {prependIcon && <Icon name={prependIcon} size={rounded ? 24 : 20} color="var(--text-secondary)" />}
      <input ref={inputRef} {...rest} />
      {appendIcon}
    </div>
  )
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={cx('v-field', className)} style={{ alignItems: 'stretch' }}>
      <textarea {...rest} />
    </div>
  )
}

export function SelectField({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className={cx('v-field', className)}>
      <select {...rest}>{children}</select>
      <Icon name="mdi-menu-down" color="var(--text-secondary)" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Divider                                                                    */
/* -------------------------------------------------------------------------- */

export function Divider({ vertical, className, style }: { vertical?: boolean; className?: string; style?: CSSProperties }) {
  return <hr className={cx('v-divider', vertical && 'v-divider--vertical', className)} style={style} />
}

/* -------------------------------------------------------------------------- */
/* Menu (click-outside dropdown)                                              */
/* -------------------------------------------------------------------------- */

export function Menu({
  activator,
  children,
  align = 'right',
  className,
}: {
  activator: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }} className={className}>
      {activator({ open, toggle: () => setOpen(o => !o) })}
      {open && (
        <div
          className="v-menu__content"
          style={{ position: 'absolute', top: 'calc(100% + 8px)', [align]: 0, zIndex: 60 }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* -------------------------------------------------------------------------- */

export function Tooltip({
  text,
  position = 'right',
  children,
}: {
  text: string
  position?: 'right' | 'bottom'
  children: ReactNode
}) {
  const [show, setShow] = useState(false)
  const placement: CSSProperties =
    position === 'right'
      ? { left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)' }
      : { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="v-tooltip" style={placement}>
          {text}
        </span>
      )}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                     */
/* -------------------------------------------------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  const id = useId()
  return (
    <label className={cx('v-switch', checked && 'v-switch--active')} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span className="v-switch__track">
        <span className="v-switch__thumb" />
      </span>
      {label && <span style={{ fontSize: '0.9375rem' }}>{label}</span>}
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* -------------------------------------------------------------------------- */

export function Dialog({
  onClose,
  maxWidth = 520,
  children,
  align = 'center',
}: {
  onClose: () => void
  maxWidth?: number
  children: ReactNode
  align?: 'center' | 'top'
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="v-overlay"
      style={align === 'top' ? { alignItems: 'flex-start', paddingTop: '12vh' } : undefined}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div className="v-dialog" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  )
}

export function DialogTitle({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '18px 22px',
        borderBottom: '1px solid var(--v-border-base)',
      }}
    >
      <h2 style={{ fontSize: '1.125rem', fontWeight: 500 }}>{children}</h2>
      {onClose && (
        <Btn icon onClick={onClose} aria-label="Close">
          <Icon name="mdi-close" />
        </Btn>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

export type TabItem = {
  value: string
  label: string
  icon?: string
  /** Count shown beside the label. Zero renders nothing rather than a "0". */
  badge?: number
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cx('v-tabs', className)} role="tablist">
      {items.map(item => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cx('v-tab', active && 'v-tab--active')}
            onClick={() => onChange(item.value)}
          >
            {item.icon && <Icon name={item.icon} size={18} />}
            {item.label}
            {!!item.badge && <span className="v-tab__badge">{item.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Breadcrumbs                                                                */
/* -------------------------------------------------------------------------- */

export type Crumb = { text: string; href?: string }

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={cx('v-breadcrumbs', className)}>
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.text}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {last || !item.href ? (
                <span className="v-breadcrumbs__item v-breadcrumbs__item--disabled">{item.text}</span>
              ) : (
                <Link to={item.href} className="v-breadcrumbs__item">
                  {item.text}
                </Link>
              )}
              {!last && <span className="v-breadcrumbs__divider">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="text--disabled" style={{ textAlign: 'center', padding: '64px 0' }}>
      <Icon name="mdi-loading mdi-spin" size={28} />
      <p style={{ marginTop: 12, color: 'inherit' }}>{label}</p>
    </div>
  )
}

export function EmptyState({ icon = 'mdi-inbox-outline', title, action }: { icon?: string; title: string; action?: ReactNode }) {
  return (
    <div className="text--disabled" style={{ textAlign: 'center', padding: '64px 16px' }}>
      <Icon name={icon} size={44} />
      <p style={{ marginTop: 12, color: 'inherit' }}>{title}</p>
      {action}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p style={{ color: 'var(--v-error-base)', fontSize: '0.875rem', margin: '8px 0 0' }}>{children}</p>
  )
}

/* -------------------------------------------------------------------------- */
/* Section heading used across content pages                                  */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 24,
      }}
    >
      <div>
        <h1 className="pageHeading">{title}</h1>
        {subtitle && <p className="text--secondary" style={{ margin: 0 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  )
}
