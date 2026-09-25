import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

/**
 * A dropdown anchored under its trigger. Closes on a click outside, on Escape,
 * and after any item is chosen.
 */
export function Menu({
  trigger,
  children,
  align = 'right',
  width = 240,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={root} className="menu">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cx('menu__panel', `menu__panel--${align}`)} style={{ width }} role="menu">
          {children(close)}
        </div>
      )}
    </div>
  )
}

type ItemProps = {
  icon?: IconName
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  onSelect?: () => void
  to?: string
  href?: string
  close: () => void
}

export function MenuItem({
  icon,
  children,
  danger,
  disabled,
  onSelect,
  to,
  href,
  close,
}: ItemProps) {
  const className = cx('menu__item', danger && 'menu__item--danger')
  const content = (
    <>
      {icon && <Icon name={icon} size={17} />}
      <span className="grow">{children}</span>
    </>
  )

  if (to) {
    return (
      <Link role="menuitem" to={to} className={className} onClick={close}>
        {content}
      </Link>
    )
  }
  if (href) {
    return (
      <a role="menuitem" href={href} className={className} onClick={close}>
        {content}
      </a>
    )
  }
  return (
    <button
      type="button"
      role="menuitem"
      className={className}
      disabled={disabled}
      onClick={() => {
        close()
        onSelect?.()
      }}
    >
      {content}
    </button>
  )
}

export function MenuDivider() {
  return <hr className="menu__rule" />
}
