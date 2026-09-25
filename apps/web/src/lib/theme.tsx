import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Light or dark, and whether the ⌘K command panel is open.
 *
 * The theme is resolved before first paint by the script in index.html (same
 * storage key, same fallback to the OS preference), so this only has to keep
 * `<html data-theme>` in step once React is running.
 */
interface ThemeState {
  darkMode: boolean
  setDarkMode: (dark: boolean) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

const KEY = 'dark-mode'

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved !== null) return saved === 'true'
  } catch {
    // Storage blocked: fall through to the OS preference.
  }
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDark] = useState(initialDark)
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', darkMode ? '#0f0f0f' : '#ffffff')
  }, [darkMode])

  // ⌘K / Ctrl+K from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const setDarkMode = (dark: boolean) => {
    setDark(dark)
    try {
      localStorage.setItem(KEY, String(dark))
    } catch {
      // Remembered for this visit only.
    }
  }

  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode, commandOpen, setCommandOpen }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
