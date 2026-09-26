import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import Mark from '../brand/Mark'
import { cx } from '../ui'

/**
 * The header lockup: the uofthub mark (navy in light mode, white in dark) beside
 * the wordmark.
 */
export function Logo({
  compact = false,
  tone = 'brand',
}: {
  compact?: boolean
  tone?: 'brand' | 'white'
}) {
  const { user } = useAuth()
  return (
    <Link
      to={user ? '/feed' : '/'}
      className={cx(
        'flex shrink-0 items-center gap-2.5',
        tone === 'white' ? 'text-white hover:text-white' : 'text-ink hover:text-ink'
      )}
      aria-label="uofthub home"
    >
      <Mark size={compact ? 26 : 30} tone={tone} />
      <span
        className={cx(
          'font-display font-extrabold tracking-tightest',
          compact ? 'text-21' : 'text-23'
        )}
      >
        uofthub
      </span>
    </Link>
  )
}
