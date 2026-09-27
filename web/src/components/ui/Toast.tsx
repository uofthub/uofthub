import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx'
import { Icon } from './Icon'
import { dismiss, SHOW_MS, SHOW_WITH_ACTION_MS, useToasts, type ToastItem } from './toastStore'

function ToastRow({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false)
  const left = useRef(item.action ? SHOW_WITH_ACTION_MS : SHOW_MS)

  // Counts down only while nobody is hovering or tabbed into it.
  useEffect(() => {
    if (paused || item.leaving) return
    const started = Date.now()
    const t = window.setTimeout(() => dismiss(item.id), left.current)
    return () => {
      window.clearTimeout(t)
      left.current -= Date.now() - started
    }
  }, [paused, item.id, item.leaving])

  return (
    <div
      className={cx(
        // Always dark, in either theme: it floats over the page, not in it.
        'pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-white/10 bg-[#1f2228] py-2.5 pr-2 pl-4 text-14 text-white shadow-float',
        item.leaving ? 'opacity-0 transition-opacity duration-150' : 'motion-safe:animate-rise-in'
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {item.tone === 'error' && <Icon name="alert" size={16} className="shrink-0 text-[#f1a79e]" />}
      <span className="min-w-0 grow py-0.5 leading-snug">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 font-semibold text-gold hover:bg-white/10"
          onClick={() => {
            item.action!.onClick()
            dismiss(item.id)
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
        aria-label="Dismiss"
        onClick={() => dismiss(item.id)}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

/** Where toasts appear. Mounted once, by the app shell. */
export function Toaster({ lifted }: { /** Clear the phone's bottom bar. */ lifted?: boolean }) {
  const list = useToasts()
  return createPortal(
    <div
      className={cx(
        'pointer-events-none fixed inset-x-0 z-110 flex flex-col items-center gap-2 px-4',
        lifted ? 'bottom-[calc(var(--spacing-bottom-nav)+12px)]' : 'bottom-6'
      )}
      role="status"
      aria-live="polite"
    >
      {list.map((t) => (
        <div key={t.id} className="flex w-full max-w-[440px] justify-center">
          <ToastRow item={t} />
        </div>
      ))}
    </div>,
    document.body
  )
}
