import { createContext, useContext } from 'react'

/**
 * Light or dark, and whether the ⌘K command panel is open.
 *
 * The theme is resolved before first paint by public/theme.js (same
 * storage key, same fallback to the OS preference), so this only has to keep
 * `<html data-theme>` in step once React is running.
 */
export interface ThemeState {
  darkMode: boolean
  setDarkMode: (dark: boolean) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
