import { Link } from 'react-router-dom'
import Mark from '../brand/Mark'

/**
 * The header lockup: the uofthub mark (navy in light mode, white in dark — see
 * `.mark` in index.css) beside the wordmark.
 */
export function Logo({
  compact = false,
  tone = 'brand',
}: {
  compact?: boolean
  tone?: 'brand' | 'white'
}) {
  return (
    <Link
      to="/"
      className={tone === 'white' ? 'logo logo--white' : 'logo'}
      aria-label="uofthub home"
    >
      <Mark size={compact ? 26 : 30} tone={tone} />
      <span className={compact ? 'logo__word logo__word--sm disp' : 'logo__word disp'}>
        uofthub
      </span>
    </Link>
  )
}
