import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { Card } from './Card'
import { cx } from './cx'
import { Heading } from './Type'

/**
 * The dimmed layer under a modal. A click on it (not on what it holds) closes;
 * `top` hangs the content from the upper part of the screen, as the command
 * panel does, instead of centring it.
 */
export function Scrim({
  onClose,
  top,
  children,
}: {
  onClose: () => void
  top?: boolean
  children: ReactNode
}) {
  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-100 flex animate-fade-in justify-center bg-[rgba(21,23,28,0.42)] p-4',
        top ? 'items-start pt-[12vh]' : 'items-center'
      )}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>,
    document.body
  )
}

/** The raised card a modal is drawn on. */
export const dialogPanel = 'flex max-h-[calc(100vh-32px)] w-full flex-col shadow-pop animate-pop-in'

/**
 * A modal in the design's card language. Escape and a click on the scrim both
 * close it, and the page behind stops scrolling while it is open.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <Scrim onClose={onClose}>
      <Card
        className={dialogPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between gap-3 pt-4.5 pr-4.5 pb-1.5 pl-6">
          <Heading id={titleId} className="text-20">
            {title}
          </Heading>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon="close"
            aria-label="Close"
            onClick={onClose}
          />
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pt-3 pb-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2.5 border-t border-line-soft px-6 pt-4 pb-5">
            {footer}
          </div>
        )}
      </Card>
    </Scrim>
  )
}
