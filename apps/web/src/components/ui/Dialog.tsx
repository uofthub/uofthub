import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

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

  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: width }}
      >
        <div className="dialog__head">
          <h2 id={titleId} className="h2" style={{ fontSize: 20 }}>
            {title}
          </h2>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon="close"
            aria-label="Close"
            onClick={onClose}
          />
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
