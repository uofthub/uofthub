import { useEffect, useState } from 'react'
import { cx, Icon } from '../ui'

/** Floating "back to top" button, shown once the page is scrolled past `threshold`. */
export function ScrollUp({
  threshold = 500,
  phone = false,
}: {
  threshold?: number
  /** Lifts it clear of the phone's bottom bar. */
  phone?: boolean
}) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > threshold)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  if (!show) return null
  const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <button
      type="button"
      className={cx(
        'fixed z-40 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-float hover:border-navy-ink hover:text-navy-ink motion-safe:animate-rise-in',
        phone ? 'right-4 bottom-[calc(var(--spacing-bottom-nav)+16px)]' : 'right-6 bottom-6'
      )}
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })}
    >
      <Icon name="chevronUp" size={20} />
    </button>
  )
}
