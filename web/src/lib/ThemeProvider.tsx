import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext } from './theme'

const KEY = 'dark-mode'

function initialDark(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    // Storage blocked: start light.
    return false
  }
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
