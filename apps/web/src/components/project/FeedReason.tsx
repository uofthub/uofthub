import { Link } from 'react-router-dom'
import type { FeedReason as Reason } from '../../lib/api'
import { campusLabel } from '../../lib/campus'
import { Icon } from '../ui'

const reasonLink = 'font-semibold text-ink-2 hover:text-ink-2'

/** The line above a feed card saying why it is in this student's feed. */
export function FeedReason({ reason }: { reason: Reason }) {
  const { icon, body } = (() => {
    switch (reason.kind) {
      case 'FOLLOWING':
        return {
          icon: 'user' as const,
          body: (
            <>
              <Link to={`/u/${reason.userId}`} className={reasonLink}>
                {reason.userName}
              </Link>
              , who you follow, published this
            </>
          ),
        }
      case 'COURSE':
        return {
          icon: 'layers' as const,
          body: (
            <>
              Tagged{' '}
              <Link to={`/explore?course=${encodeURIComponent(reason.tag)}`} className={reasonLink}>
                {reason.tag}
              </Link>{' '}
              — one of your courses
            </>
          ),
        }
      case 'CAMPUS':
        return { icon: 'mapPin' as const, body: <>From {campusLabel(reason.campus)}</> }
      case 'TRENDING':
        return { icon: 'chart' as const, body: <>Being read across uofthub</> }
    }
  })()

  return (
    <div className="flex items-center gap-1.5 px-3.5 pt-2.5 text-12 text-muted md:px-5 md:pt-3 md:text-13">
      <Icon name={icon} size={14} />
      <span>{body}</span>
    </div>
  )
}
