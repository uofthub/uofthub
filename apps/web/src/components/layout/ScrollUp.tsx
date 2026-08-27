import { useEffect, useState } from 'react'
import { Icon } from '../ui'

/** Floating "back to top" button, shown past 500px of scroll (ScrollUp.vue). */
export default function ScrollUp({ threshold = 500 }: { threshold?: number }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > threshold)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  if (!show) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 40,
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        background: 'var(--v-accent-base)',
        color: '#fff',
        boxShadow: 'var(--elevation-8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="mdi-chevron-up" size={28} color="#fff" />
    </button>
  )
}
