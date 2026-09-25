import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Notification } from '@uofthub/types'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { messageFor } from '../../lib/notifications'
import { timeAgo } from '../../lib/projectView'
import { Button, Icon, Menu } from '../ui'

/** The header bell: a red dot for unread, and the list under it. */
export function NotificationBell({ bare = false }: { bare?: boolean }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  // Opening the bell marks everything read, which would grey out the very
  // items the student opened it to see. Freezing what was unread at open
  // keeps them highlighted until the list is opened again.
  const [wasUnread, setWasUnread] = useState<Set<string>>(new Set())
  const [answered, setAnswered] = useState<Set<string>>(new Set())

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    enabled: !!user,
    // Polling, not push — see ROADMAP.md § Later.
    refetchInterval: 30_000,
  })

  const respond = useMutation({
    mutationFn: ({ n, accepted }: { n: Notification; accepted: boolean }) =>
      api.projects.respondToInvite(String(n.payload.projectId), user!.id, accepted),
    onSuccess: (_data, { n }) => {
      setAnswered((prev) => new Set(prev).add(n.id))
      qc.invalidateQueries({ queryKey: ['project', n.payload.projectId] })
    },
  })

  if (!user) return null

  const notifications = data?.notifications ?? []
  const unread = data?.unreadCount ?? 0

  const onOpen = async () => {
    setWasUnread(new Set(notifications.filter((n) => !n.read).map((n) => n.id)))
    if (unread === 0) return
    await api.notifications.markAllRead()
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <Menu
      width={360}
      trigger={({ toggle, open }) => (
        <Button
          iconOnly
          variant={bare ? 'ghost' : 'default'}
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
          aria-expanded={open}
          onClick={() => {
            if (!open) onOpen()
            toggle()
          }}
          style={{ position: 'relative' }}
        >
          <Icon name="bell" size={20} />
          {unread > 0 && <span className="bell__dot" aria-hidden="true" />}
        </Button>
      )}
    >
      {(close) => (
        <div className="bell">
          <div className="bell__head">
            <span className="h2" style={{ fontSize: 18 }}>
              Notifications
            </span>
          </div>
          {notifications.length === 0 ? (
            <p className="muted" style={{ padding: '8px 12px 14px', fontSize: 14 }}>
              Nothing yet. Reactions, comments and follows on your work show up here.
            </p>
          ) : (
            <ul className="bell__list">
              {notifications.map((n) => {
                const { text, to } = messageFor(n)
                const fresh = wasUnread.has(n.id)
                return (
                  <li key={n.id} className={fresh ? 'bell__item bell__item--fresh' : 'bell__item'}>
                    <Link to={to} onClick={close} className="bell__link">
                      <span className="bell__text">{text}</span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {timeAgo(n.createdAt)}
                      </span>
                    </Link>
                    {n.type === 'COLLABORATOR_INVITED' && !answered.has(n.id) && (
                      // Answered here rather than on the project page: a pending
                      // collaborator can't open a PRIVATE project yet, so the
                      // link above would 404 until they accept.
                      <div className="row" style={{ gap: 8, padding: '0 12px 10px' }}>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => respond.mutate({ n, accepted: true })}
                          disabled={respond.isPending}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => respond.mutate({ n, accepted: false })}
                          disabled={respond.isPending}
                        >
                          Decline
                        </Button>
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
