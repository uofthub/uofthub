import type { CSSProperties } from 'react'
import { useTheme } from '../../lib/theme'
import logoBrand from '../../assets/uofthub-logo.svg'
import logoLight from '../../assets/uofthub-logo-light.svg'

/**
 * The full lockup: mark, wordmark and tagline.
 *
 * Unlike Mark this stays an <img> rather than inline SVG — the wordmark paths
 * are ~11KB and only the landing page uses them, so they are better off cached
 * as a separate asset than inlined into the bundle. That means it cannot be
 * themed with CSS variables, so the variant is chosen here instead.
 */
export default function Logo({
  width = 420,
  className,
  style,
}: {
  width?: number | string
  className?: string
  style?: CSSProperties
}) {
  const { darkMode } = useTheme()

  return (
    <img
      src={darkMode ? logoLight : logoBrand}
      alt="uofthub"
      className={className}
      style={{ display: 'block', width, maxWidth: '100%', height: 'auto', ...style }}
    />
  )
}
