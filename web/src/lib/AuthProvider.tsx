import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type MeUser } from './api'
import { AuthContext } from './auth'
import { disablePush, setBadgePart } from './push'

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

  const qc = useQueryClient()
  // Whose data the cache holds: undefined until the first check answers.
  const cachedFor = useRef<string | null | undefined>(undefined)
  // Everything cached was fetched as one account — whether they may edit a
  // project, what they saved, their messages. Signing in as somebody else
  // without logging out here (another tab, an expired session) must not show
  // it to them: a project page cached as its owner would still offer the
  // owner's Manage links and Manage files.
  const settle = (me: MeUser | null) => {
    const id = me?.id ?? null
    if (cachedFor.current !== undefined && cachedFor.current !== id) qc.clear()
    cachedFor.current = id
    setUser(me)
  }

  // The first check needs no `setLoading(true)` — loading starts true — so
  // the mount effect only starts the request; a later refetch says it is busy.
  const load = () => {
    api.auth
      .me()
      .then((me) => {
        settle(me)
        remember(true)
      })
      .catch(() => {
        settle(null)
        remember(false)
      })
      .finally(() => setLoading(false))
  }

  const refetch = () => {
    setLoading(true)
    load()
  }

  // Once, on mount: everything `load` touches is a ref, a setter or the client.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const logout = async () => {
    // First, while this browser's subscription can still be named: whoever
    // uses it next must not get this student's notifications.
    await disablePush()
    await api.auth.logout()
    setBadgePart('notifications', 0)
    setBadgePart('messages', 0)
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
