import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button, Icon } from '../ui'
import { UnreadDot } from './UnreadDot'

/** The header's way into Messages, with a dot while something is unread. */
export function MessagesButton({ bare = false }: { bare?: boolean }) {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: () => api.messages.unread(),
    enabled: !!user,
    // Polling, like the bell — see ROADMAP.md § Later.
    refetchInterval: 30_000,
  })
  if (!user) return null
  const unread = data?.count ?? 0
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
