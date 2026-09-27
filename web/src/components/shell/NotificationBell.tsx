import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { messageFor } from '../../lib/notifications'
import {
  closeShownNotifications,
  dismissNudge,
  enablePush,
  isInstalled,
  isIos,
  nudgeDismissed,
  pushState,
  setBadgePart,
} from '../../lib/push'
import { timeAgo } from '../../lib/projectView'
import { Button, cx, Heading, Icon, Menu } from '../ui'
import { UnreadDot } from './UnreadDot'

/**
 * "Get these on this device?" — once, at the top of the bell, for a browser
 * that could have push but hasn't. The bell is where somebody already cares
 * about notifications; a setting three menus deep is where nobody finds it.
 * On an iPhone not yet running uofthub from its home screen, it says how.
 */
function PushNudge() {
  const qc = useQueryClient()
  const [hidden, setHidden] = useState(nudgeDismissed)
  const state = useQuery({
    queryKey: ['push-state'],
    queryFn: pushState,
    staleTime: Infinity,
    enabled: !hidden,
  })
  const enable = useMutation({
    mutationFn: enablePush,
    onSuccess: (next) => qc.setQueryData(['push-state'], next),
  })
  const iphone = state.data === 'unsupported' && isIos() && !isInstalled()
  if (hidden || (state.data !== 'off' && !iphone)) return null
  const dismiss = () => {
    dismissNudge()
    setHidden(true)
  }

  return (
    <section className="mx-1 mb-2 flex flex-col gap-2 rounded-lg bg-fill p-2.5">
      <span className="text-14 leading-[1.4]">
        {iphone
          ? 'Get notifications on this iPhone: tap Share, then “Add to Home Screen”, and open uofthub from there.'
          : 'Get messages, comments and invitations on this device, even with uofthub closed.'}
      </span>
      <span className="flex gap-2">
        {!iphone && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => enable.mutate()}
            disabled={enable.isPending}
          >
            {enable.isPending ? 'Turning on…' : 'Turn on'}
          </Button>
        )}
        <Button size="sm" onClick={dismiss}>
          {iphone ? 'Got it' : 'Not now'}
        </Button>
      </span>
    </section>
  )
}

/** The header bell: a red dot for unread, and the list under it. */
export function NotificationBell({ bare = false }: { bare?: boolean }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  // Opening the bell marks everything read, which would grey out the very
  // items the student opened it to see. Freezing what was unread at open
  // keeps them highlighted until the list is opened again.
  const [wasUnread, setWasUnread] = useState<Set<string>>(new Set())

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.notifications.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!user,
    // Kept current by the live stream — see lib/live.ts.
  })

  // Invitations still waiting, read from the invitations themselves rather
  // than from the notifications that announced them: an old one scrolled out
  // of the list is still waiting, and an answered one is not. Under the
  // notifications key, so the live stream refreshes both.
  const { data: invites = [] } = useQuery({
    queryKey: ['notifications', 'invites'],
    queryFn: () => api.users.invites(),
    enabled: !!user,
  })
  const { data: orgInvites = [] } = useQuery({
    queryKey: ['notifications', 'org-invites'],
    queryFn: () => api.users.orgInvites(),
    enabled: !!user,
  })
  const answerOrg = useMutation({
    mutationFn: ({ slug, accepted }: { slug: string; accepted: boolean }) =>
      api.orgs.answerInvite(slug, accepted),
    onSuccess: (_data, { slug }) => {
      qc.invalidateQueries({ queryKey: ['notifications', 'org-invites'] })
      qc.invalidateQueries({ queryKey: ['org', slug] })
    },
  })
  const respond = useMutation({
    mutationFn: ({ projectId, accepted }: { projectId: string; accepted: boolean }) =>
      api.projects.respondToInvite(projectId, user!.id, accepted),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['notifications', 'invites'] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })

  const unread = data?.pages[0]?.unreadCount ?? 0
  useEffect(() => setBadgePart('notifications', user ? unread : 0), [user, unread])

  if (!user) return null

  const notifications = data?.pages.flatMap((p) => p.notifications) ?? []

  const onOpen = async () => {
    setWasUnread(new Set(notifications.filter((n) => !n.read).map((n) => n.id)))
    // Seen here now, so the copies on the lock screen can go — not messages,
    // which are read in Messages.
    closeShownNotifications((n) => !n.tag.startsWith('message:'))
    if (unread === 0) return
    await api.notifications.markAllRead()
    qc.invalidateQueries({ queryKey: ['notifications', 'list'] })
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
          <PushNudge />
          {(invites.length > 0 || orgInvites.length > 0) && (
            <section className="mx-1 mb-2 flex flex-col gap-2 rounded-lg bg-navy-wash p-2.5">
              <span className="text-13 font-semibold text-navy-ink">Waiting for your answer</span>
              {invites.map((invite) => (
                <div key={invite.projectId} className="flex flex-col gap-1.5">
                  <span className="text-14 leading-[1.4]">
                    <b>{invite.owner.name}</b> invited you to <b>{invite.projectTitle}</b>
                    {invite.title && ` as ${invite.title}`}
                  </span>
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        respond.mutate({ projectId: invite.projectId, accepted: true })
                      }
                      disabled={respond.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        respond.mutate({ projectId: invite.projectId, accepted: false })
                      }
                      disabled={respond.isPending}
                    >
                      Decline
                    </Button>
                  </span>
                </div>
              ))}
              {orgInvites.map((invite) => (
                <div key={invite.slug} className="flex flex-col gap-1.5">
                  <span className="text-14 leading-[1.4]">
                    <b>{invite.name}</b> invited you to join
                    {invite.role === 'ADMIN' && ' as an admin'}
                  </span>
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => answerOrg.mutate({ slug: invite.slug, accepted: true })}
                      disabled={answerOrg.isPending}
                    >
                      Join
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => answerOrg.mutate({ slug: invite.slug, accepted: false })}
                      disabled={answerOrg.isPending}
                    >
                      Decline
                    </Button>
                  </span>
                </div>
              ))}
            </section>
          )}
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
                  </li>
                )
              })}
            </ul>
          )}
          {hasNextPage && (
            <div className="px-3 pb-2.5">
              <Button size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Show older'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Menu>
  )
}
