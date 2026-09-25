import { useTheme } from '../../lib/theme'
import { Button } from '../ui'

/** The sun/moon button: light and dark, remembered per browser. */
export function ThemeToggle({ bare = false }: { bare?: boolean }) {
  const { darkMode, setDarkMode } = useTheme()
  return (
    <Button
      iconOnly
      variant={bare ? 'ghost' : 'default'}
      icon={darkMode ? 'sun' : 'moon'}
      iconSize={20}
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={darkMode ? 'Light mode' : 'Dark mode'}
      onClick={() => setDarkMode(!darkMode)}
    />
  )
}
