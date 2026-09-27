import { useEffect, useState } from 'react'
import { StatusBanner, toast } from '../ui'

/**
 * Says so while the browser is offline, since nothing posted or saved in the
 * meantime will go through. Closing it hides it until the next time the
 * connection drops; coming back says so once, quietly.
 */
export function OfflineBanner({ className }: { className?: string }) {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const down = () => {
      setOffline(true)
      setHidden(false)
    }
    const up = () => {
      setOffline(false)
      toast('You’re back online.')
    }
    window.addEventListener('offline', down)
    window.addEventListener('online', up)
    return () => {
      window.removeEventListener('offline', down)
      window.removeEventListener('online', up)
    }
  }, [])

  if (!offline || hidden) return null
  return (
    <StatusBanner icon="globe" onDismiss={() => setHidden(true)} className={className}>
      You’re offline. Anything you post or save won’t go through until you’re connected again.
    </StatusBanner>
  )
}
