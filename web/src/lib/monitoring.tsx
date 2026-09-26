import { useEffect, type ReactNode } from 'react'
import { CluelineProvider, useCluelineIdentify } from '@clueline/react'
import { useAuth } from './auth'

/**
 * Error reporting to Clueline (clueline.dev): a root-level boundary that shows
 * a calm fallback instead of a white screen, plus global handlers for uncaught
 * errors and unhandled rejections.
 */

const apiKey = import.meta.env.VITE_CLUELINE_API_KEY

/** Whether reporting is configured at all. */
export const monitoringEnabled = Boolean(apiKey)

/**
 * With no key configured the app renders exactly as it did before monitoring
 * existed — a local `pnpm dev` shouldn't need a Clueline project.
 */
export function Monitoring({ children }: { children: ReactNode }) {
  if (!apiKey) return <>{children}</>

  return (
    <CluelineProvider
      apiKey={apiKey}
      environment={import.meta.env.PROD ? 'production' : 'development'}
      ui={{
        title: 'Something broke on our end',
        description:
          'The error has been logged. Telling us what you were doing helps more than you would think.',
        retryLabel: 'Reload the page',
      }}
    >
      {children}
    </CluelineProvider>
  )
}

/**
 * Ties a report to the signed-in student — by id only.
 *
 * The SDK also accepts `email` and `name`, which is what lets Clueline follow
 * up with the person directly; that is a deliberate opt-in we have not taken.
 * Sending a student's U of T address to a third party by default sits badly
 * with the promise on /about and /privacy, and the id is enough to correlate
 * reports. Add the other fields here if you decide the outreach is worth the
 * disclosure — and update the privacy policy in the same commit.
 *
 * Renders nothing, and must be inside both `Monitoring` and `AuthProvider`.
 */
export function IdentifyViewer() {
  const { user } = useAuth()
  const { identify } = useCluelineIdentify()

  useEffect(() => {
    if (user) identify({ userId: user.id })
  }, [user, identify])

  return null
}
