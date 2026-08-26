import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api, type MeUser } from './api'

interface AuthCtx {
  user: MeUser | null
  loading: boolean
  logout: () => Promise<void>
  refetch: () => void
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, logout: async () => {}, refetch: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = () => {
    setLoading(true)
    api.auth.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }

  useEffect(fetchMe, [])

  const logout = async () => {
    await api.auth.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
