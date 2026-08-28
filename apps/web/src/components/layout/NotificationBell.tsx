import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Notification } from '@uofthub/types'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Btn, Icon, Menu } from '../ui'

function messageFor(n: Notification): { text: string; to: string } {
  const p = n.payload as Record<string, string | boolean | undefined>
  const to = typeof p.projectId === 'string' ? `/projects/${p.projectId}` : '/'

  switch (n.type) {
    case 'COLLABORATOR_INVITED':
      return { text: `${p.inviterName} invited you to collaborate on "${p.projectTitle}"`, to }
    case 'COLLABORATOR_RESPONDED':
      return { text: `${p.userName} ${p.accepted ? 'accepted' : 'declined'} your invite to "${p.projectTitle}"`, to }
    case 'ACCESS_REQUESTED':
      return { text: `${p.requesterName} requested viewer access to "${p.projectTitle}"`, to }
    case 'ACCESS_REQUEST_DECIDED':
      return { text: `Your access request for "${p.projectTitle}" was ${p.accepted ? 'approved' : 'denied'}`, to }
  }
}

export default function NotificationBell() {
  const { user } = useAuth()
  const qc = useQueryClient()
  // Opening the bell marks everything read, which would grey out the very
  // items the student opened it to see. Freezing what was unread at open
  // keeps them highlighted until the dropdown is opened again.
  const [wasUnread, setWasUnread] = useState<Set<string>>(new Set())
  const [answered, setAnswered] = useState<Set<string>>(new Set())

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    enabled: !!user,
    // Polling, not push — good enough for an MVP feed with no WebSocket
    // infrastructure (that's explicitly deferred, see ROADMAP.md § Later).
    refetchInterval: 30_000,
  })

  const respond = useMutation({
    mutationFn: ({ n, accepted }: { n: Notification; accepted: boolean }) =>
      api.projects.respondToInvite(String(n.payload.projectId), user!.id, accepted),
    onSuccess: (_data, { n }) => {
      setAnswered(prev => new Set(prev).add(n.id))
      qc.invalidateQueries({ queryKey: ['project', n.payload.projectId] })
    },
  })

  if (!user) return null

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  const onOpen = async () => {
    setWasUnread(new Set(notifications.filter(n => !n.read).map(n => n.id)))
    if (unreadCount === 0) return
    await api.notifications.markAllRead()
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <Menu
      activator={({ toggle }) => (
        <Btn
          icon
          onClick={() => {
            toggle()
            onOpen()
          }}
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          style={{ position: 'relative' }}
        >
          <Icon name="mdi-bell-outline" size={22} />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--v-error-base)',
              }}
            />
          )}
        </Btn>
      )}
    >
      {close => (
        <div style={{ width: 320, maxHeight: 420, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: 16, fontSize: '0.875rem', color: 'var(--v-secondary-base)' }}>
              No notifications yet
            </div>
          ) : (
            <ul className="v-list" style={{ padding: '6px 0' }}>
              {notifications.map(n => {
                const { text, to } = messageFor(n)
                return (
                  <li key={n.id}>
                    <Link
                      to={to}
                      onClick={close}
                      className="v-list-item"
                      style={{
                        display: 'block',
                        whiteSpace: 'normal',
                        opacity: n.read && !wasUnread.has(n.id) ? 0.6 : 1,
                      }}
                    >
                      <div style={{ fontSize: '0.875rem', fontWeight: wasUnread.has(n.id) ? 500 : 400 }}>{text}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--v-secondary-base)', marginTop: 2 }}>
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </Link>
                    {n.type === 'COLLABORATOR_INVITED' && !answered.has(n.id) && (
                      // Answered here rather than on the project page: a pending
                      // collaborator can't open a PRIVATE project yet, so the
                      // link above would 404 until they accept.
                      <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px' }}>
                        <Btn
                          variant="outlined"
                          size="small"
                          onClick={() => respond.mutate({ n, accepted: true })}
                          disabled={respond.isPending}
                        >
                          Accept
                        </Btn>
                        <Btn
                          size="small"
                          onClick={() => respond.mutate({ n, accepted: false })}
                          disabled={respond.isPending}
                          style={{ color: 'var(--tone-error)' }}
                        >
                          Decline
                        </Btn>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Menu>
  )
}
