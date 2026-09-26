import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Notification } from '@uofthub/types'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { messageFor } from '../../lib/notifications'
import { timeAgo } from '../../lib/projectView'
import { Button, cx, Heading, Icon, Menu } from '../ui'
import { UnreadDot } from './UnreadDot'

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
          className="relative"
        >
          <Icon name="bell" size={20} />
          {unread > 0 && <UnreadDot />}
        </Button>
      )}
    >
      {(close) => (
        <div className="max-h-[min(480px,70vh)] overflow-y-auto">
          <div className="px-3 pt-2 pb-1.5">
            <Heading as="span" className="text-18">
              Notifications
            </Heading>
          </div>
          {notifications.length === 0 ? (
            <p className="px-3 pt-2 pb-3.5 text-14 text-muted">
              Nothing yet. Reactions, comments and follows on your work show up here.
            </p>
          ) : (
            <ul>
              {notifications.map((n) => {
                const { text, to } = messageFor(n)
                const fresh = wasUnread.has(n.id)
                return (
                  <li key={n.id} className={cx('rounded-lg', fresh && 'bg-navy-wash')}>
                    <Link
                      to={to}
                      onClick={close}
                      className="flex flex-col gap-0.75 rounded-lg px-3 py-2.5 text-ink hover:bg-fill hover:text-ink"
                    >
                      <span className={cx('text-14 leading-[1.4]', fresh && 'font-semibold')}>
                        {text}
                      </span>
                      <span className="text-12 text-muted">{timeAgo(n.createdAt)}</span>
                    </Link>
                    {n.type === 'COLLABORATOR_INVITED' && !answered.has(n.id) && (
                      // Answered here rather than on the project page: a pending
                      // collaborator can't open a PRIVATE project yet, so the
                      // link above would 404 until they accept.
                      <div className="flex items-center gap-2 px-3 pb-2.5">
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
