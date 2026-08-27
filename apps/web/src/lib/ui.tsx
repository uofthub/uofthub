import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * App-level UI state — the React equivalent of uoftindex.ca's `app` Pinia store:
 * theme, live animations, sidebar collapse, command palette, viewport size.
 */
interface UIState {
  darkMode: boolean
  setDarkMode: (v: boolean) => void
  liveAnimations: boolean
  setLiveAnimations: (v: boolean) => void
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  commandModal: boolean
  setCommandModal: (v: boolean) => void
  mobileNav: boolean
  setMobileNav: (v: boolean) => void
  width: number
  onMobile: boolean
  onDesktop: boolean
}

const UIContext = createContext<UIState | null>(null)

const read = (key: string, fallback: boolean) => {
  const stored = localStorage.getItem(key)
  return stored === null ? fallback : stored === 'true'
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkModeState] = useState(() =>
    read('dark-mode', window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true),
  )
  const [liveAnimations, setLiveAnimationsState] = useState(() => read('live-animations', true))
  const [collapsed, setCollapsedState] = useState(() => read('sidebar-collapsed', false))
  const [commandModal, setCommandModal] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [width, setWidth] = useState(() => document.documentElement.clientWidth)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', darkMode ? '#0f0f0f' : '#ffffff')
  }, [darkMode])

  useEffect(() => {
    const onResize = () => setWidth(document.documentElement.clientWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ⌘K / Ctrl+K opens the command palette, Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandModal(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const persist = useCallback(
    (key: string, set: (v: boolean) => void) => (v: boolean) => {
      localStorage.setItem(key, String(v))
      set(v)
    },
    [],
  )

  const setDarkMode = persist('dark-mode', setDarkModeState)
  const setLiveAnimations = persist('live-animations', setLiveAnimationsState)
  const setCollapsed = persist('sidebar-collapsed', setCollapsedState)

  return (
    <UIContext.Provider
      value={{
        darkMode,
        setDarkMode,
        liveAnimations,
        setLiveAnimations,
        collapsed,
        setCollapsed,
        commandModal,
        setCommandModal,
        mobileNav,
        setMobileNav,
        width,
        onMobile: width <= 600,
        onDesktop: width >= 1200,
      }}
    >
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>')
  return ctx
}
