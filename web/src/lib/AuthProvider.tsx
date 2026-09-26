import { useState, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type MeUser } from './api'
import { AuthContext } from './auth'

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

  // The first check needs no `setLoading(true)` — loading starts true — so
  // the mount effect only starts the request; a later refetch says it is busy.
  const load = () => {
    api.auth
      .me()
      .then((me) => {
        setUser(me)
        remember(true)
      })
      .catch(() => {
        setUser(null)
        remember(false)
      })
      .finally(() => setLoading(false))
  }

  const refetch = () => {
    setLoading(true)
    load()
  }

  useEffect(load, [])

  const qc = useQueryClient()
  const logout = async () => {
    await api.auth.logout()
    setUser(null)
    remember(false)
    // Everything cached was fetched as this student — saved projects, their
    // messages, drafts. None of it may be shown to whoever uses the tab next.
    qc.clear()
  }

  return (
    <AuthContext.Provider value={{ user, loading, maybeSignedIn, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  )
}
