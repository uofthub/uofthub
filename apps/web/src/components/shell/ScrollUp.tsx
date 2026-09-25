import { useEffect, useState } from 'react'
import { Icon } from '../ui'

/** Floating "back to top" button, shown once the page is scrolled past `threshold`. */
export function ScrollUp({ threshold = 500 }: { threshold?: number }) {
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
      className="scroll-up"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })}
    >
      <Icon name="chevronUp" size={20} />
    </button>
  )
}
