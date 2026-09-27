import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { setBadgePart } from '../../lib/push'
import { Button, Icon } from '../ui'
import { UnreadDot } from './UnreadDot'

/** The header's way into Messages, with a dot while something is unread. */
export function MessagesButton({ bare = false }: { bare?: boolean }) {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: () => api.messages.unread(),
    enabled: !!user,
    // Kept current by the live stream, like the bell — see lib/live.ts.
  })
  const unread = data?.count ?? 0
  useEffect(() => setBadgePart('messages', user ? unread : 0), [user, unread])
  if (!user) return null
  return (
    <Button
      iconOnly
      variant={bare ? 'ghost' : 'default'}
      to="/messages"
      aria-label={unread > 0 ? `Messages (${unread} unread)` : 'Messages'}
      className="relative"
    >
      <Icon name="inbox" size={20} />
      {unread > 0 && <UnreadDot />}
    </Button>
  )
}
