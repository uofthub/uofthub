import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api, type MeUser } from './api'

interface AuthCtx {
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

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  maybeSignedIn: false,
  logout: async () => {},
  refetch: () => {},
})

const SIGNED_IN_HINT = 'signed-in'

/** Reading it can throw in a browser set to block site data; assume no. */
function readHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === 'true'
  } catch {
    return false
  }
}

function writeHint(value: boolean): void {
  try {
    localStorage.setItem(SIGNED_IN_HINT, String(value))
  } catch {
    // A browser that won't store it just pays the one-render swap.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null)
  const [loading, setLoading] = useState(true)
  // Starts as last visit's answer and is corrected by this visit's. It is not
  // derived from `user`: the whole point is that it has a value during the
  // first render, before `user` can possibly have one.
  const [maybeSignedIn, setMaybeSignedIn] = useState(readHint)

  // Written to storage wherever it is set, so the two can never disagree about
  // what the last outcome was.
  const remember = (signedIn: boolean) => {
    setMaybeSignedIn(signedIn)
    writeHint(signedIn)
  }

  const fetchMe = () => {
    setLoading(true)
    api.auth
      .me()
      .then(me => {
        setUser(me)
        remember(true)
      })
      .catch(() => {
        setUser(null)
        remember(false)
      })
      .finally(() => setLoading(false))
  }

  useEffect(fetchMe, [])

  const logout = async () => {
    await api.auth.logout()
    setUser(null)
    remember(false)
  }

  return (
    <AuthContext.Provider value={{ user, loading, maybeSignedIn, logout, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
