import { useEffect, useId } from 'react'
import { Button } from './Button'
import { Card } from './Card'
import { Scrim, dialogPanel } from './Dialog'
import { Heading } from './Type'
import { settle, usePending } from './confirmStore'

/** Draws whatever confirmAction is asking. Mounted once, by the app shell. */
export function ConfirmHost() {
  const ask = usePending()
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    if (!ask) return
    // Captured on window so it runs before — and stops — the Escape handler of
    // a Dialog this was opened from, which would otherwise close too.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      settle(false)
    }
    window.addEventListener('keydown', onKey, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
    }
  }, [ask])

  if (!ask) return null
  return (
    <Scrim onClose={() => settle(false)}>
      <Card
        className={dialogPanel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ask.body ? bodyId : undefined}
        style={{ maxWidth: 440 }}
      >
        <div className="flex flex-col gap-2 px-6 pt-5.5 pb-5">
          <Heading id={titleId} className="text-18">
            {ask.title}
          </Heading>
          {ask.body && (
            <p id={bodyId} className="text-15 leading-normal text-ink-3">
              {ask.body}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2.5 px-6 pb-5">
          <Button size="md" autoFocus={ask.danger} onClick={() => settle(false)}>
            {ask.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            size="md"
            variant={ask.danger ? 'danger' : 'primary'}
            autoFocus={!ask.danger}
            onClick={() => settle(true)}
          >
            {ask.confirmLabel}
          </Button>
        </div>
      </Card>
    </Scrim>
  )
}
