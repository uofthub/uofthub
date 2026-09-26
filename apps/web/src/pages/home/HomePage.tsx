import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Spinner } from '../../components/ui'
import FeedPage from './FeedPage'
import LandingPage from './LandingPage'

/**
 * `/` — the pitch for a visitor. A student is sent on to their feed at /feed,
 * so the two are different addresses.
 *
 * A browser that was signed in last time almost certainly still is, so it
 * waits for the answer rather than flashing the pitch at its own user; a
 * browser with no such history sees the pitch at once.
 */
export default function HomePage() {
  const { user, maybeSignedIn } = useAuth()
  if (user) return <Navigate to="/feed" replace />
  if (maybeSignedIn) return <Spinner />
  return <LandingPage />
}

/** `/feed` — the student's home. Signed out, it is the landing page's job. */
export function FeedRoute() {
  const { user, maybeSignedIn } = useAuth()
  if (user) return <FeedPage />
  if (maybeSignedIn) return <Spinner />
  return <Navigate to="/" replace />
}
