import { createContext, useContext } from 'react'
import type { MeUser } from './api'

/** The signed-in student, as every page reads it. Provided by AuthProvider.tsx. */

export interface AuthCtx {
  user: MeUser | null
  loading: boolean
  /**
   * What this browser believes about itself, answerable before `/auth/me` has
   * replied. Seeded from whether the last check on this browser succeeded, and
   * overwritten by the real answer the moment there is one.
   *
   * Only ever used to choose what to paint — the chrome on `/`, and whether it
   * shows a spinner or the marketing page. Never as authorization: it is a
   * flag this browser wrote about itself, and every protected read is still
   * the API's decision. Without it, `/` paints the landing header and tall
   * footer for a beat on every single visit by a signed-in student before
   * snapping to the app, which is exactly the kind of jank the feed exists to
   * remove.
   */
  maybeSignedIn: boolean
  logout: () => Promise<void>
  refetch: () => void
}

export const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  maybeSignedIn: false,
  logout: async () => {},
  refetch: () => {},
})

export const useAuth = () => useContext(AuthContext)
