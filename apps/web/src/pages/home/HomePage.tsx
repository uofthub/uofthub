import { useAuth } from '../../lib/auth'
import { Spinner } from '../../components/ui'
import FeedPage from './FeedPage'
import LandingPage from './LandingPage'

/**
 * `/` — the feed for a student, the pitch for a visitor.
 *
 * A browser that was signed in last time almost certainly still is, so it
 * waits for the answer rather than flashing the pitch at its own user; a
 * browser with no such history sees the pitch at once.
 */
export default function HomePage() {
  const { user, maybeSignedIn } = useAuth()
  if (user) return <FeedPage />
  if (maybeSignedIn) return <Spinner />
  return <LandingPage />
}
