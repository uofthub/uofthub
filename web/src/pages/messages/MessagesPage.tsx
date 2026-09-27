import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Conversation, type Message } from '../../lib/api'
import { closeShownNotifications } from '../../lib/push'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { PHONE, useDocumentTitle, useMediaQuery } from '../../lib/hooks'
import { timeShort } from '../../lib/projectView'
import {
  Avatar,
  Button,
  Card,
  cx,
  EmptyState,
  ErrorText,
  Heading,
  Icon,
  Menu,
  MenuItem,
  Page,
  Spinner,
  TextArea,
  confirmAction,
  toast,
} from '../../components/ui'
import { ReportConversationDialog } from './ReportConversationDialog'

const MESSAGE_MAX = 2000

/** The conversation list: newest first, bold while unread. */
function Conversations({ active }: { active?: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['messages', 'conversations'],
    queryFn: () => api.messages.conversations(),
  })
  if (isLoading) return <Spinner />
  if (data.length === 0)
    return (
      <p className="p-5 text-14 text-muted">
        No conversations yet. Message someone from their profile — a “Want to collab” is a good
        place to start.
      </p>
    )
  return (
    <ul>
      {data.map((c: Conversation) => (
        <li key={c.user.id}>
          <Link
            to={`/messages/${c.user.id}`}
            className={cx(
              'flex items-center gap-3 px-5 py-3 text-ink hover:bg-fill hover:text-ink',
              c.user.id === active && 'bg-navy-tint hover:bg-navy-tint dark:bg-fill'
            )}
            aria-current={c.user.id === active ? 'page' : undefined}
          >
            <Avatar person={c.user} size={44} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <b className={cx('truncate', c.unread > 0 ? 'font-bold' : 'font-medium')}>
                  {c.user.name}
                </b>
                <span className="ml-auto shrink-0 text-12 text-muted">
                  {timeShort(c.lastMessage.createdAt)}
                </span>
              </span>
              <span
                className={cx(
                  'truncate text-14',
                  c.unread > 0 ? 'font-semibold text-ink' : 'text-muted'
                )}
              >
                {c.blocked ? (
                  'Blocked'
                ) : (
                  <>
                    {c.lastMessage.fromMe && 'You: '}
                    {c.lastMessage.body}
                  </>
                )}
              </span>
            </span>
            {c.unread > 0 && (
              <span
                className="flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-navy px-1.5 text-12 font-bold text-white"
                aria-label={`${c.unread} unread`}
              >
                {c.unread}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** One message: theirs on the left in grey, yours on the right in navy. */
function Bubble({ message }: { message: Message }) {
  return (
    <div
      className={cx(
        'max-w-[min(520px,80%)] rounded-2xl px-3.5 py-2.5 text-15 leading-[1.45]',
        message.fromMe
          ? 'self-end rounded-br-md bg-navy text-white dark:bg-panel'
          : 'self-start rounded-bl-md bg-fill text-ink'
      )}
    >
      <p className="wrap-anywhere whitespace-pre-wrap">{message.body}</p>
      <span className="mt-0.5 block text-11 opacity-70">{timeShort(message.createdAt)}</span>
    </div>
  )
}

/** What stands in for the compose box when this conversation can't take a message. */
function Closed({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 border-t border-line px-5 pt-4 pb-5 text-14 text-muted">
      {children}
    </p>
  )
}

/** One conversation, oldest at the top, with "Show earlier" going back a page at a time. */
function ThreadView({ userId, back }: { userId: string; back: boolean }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [reporting, setReporting] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const thread = useInfiniteQuery({
    queryKey: ['messages', 'thread', userId],
    queryFn: ({ pageParam }) => api.messages.thread(userId, pageParam),
    initialPageParam: undefined as string | undefined,
    // Each page is older than the one before; its first message is where the next starts.
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
  })
  const first = thread.data?.pages[0]
  const messages: Message[] = (thread.data?.pages ?? [])
    .slice()
    .reverse()
    .flatMap((p) => p.messages)
  const newest = messages[messages.length - 1]?.id

  // Opening a conversation reads it; the badges should agree, and so should
  // the lock screen.
  useEffect(() => {
    if (!first) return
    qc.invalidateQueries({ queryKey: ['messages', 'unread'] })
    qc.invalidateQueries({ queryKey: ['messages', 'conversations'] })
    closeShownNotifications((n) => n.tag === `message:${userId}`)
  }, [first, qc, userId])

  // Keep the newest message in view as they arrive.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [newest])

  const send = useMutation({
    mutationFn: (body: string) => api.messages.send(userId, body),
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey: ['messages', 'thread', userId] })
      qc.invalidateQueries({ queryKey: ['messages', 'conversations'] })
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['messages', 'thread', userId] })
    qc.invalidateQueries({ queryKey: ['messages', 'conversations'] })
    qc.invalidateQueries({ queryKey: ['messages', 'unread'] })
  }
  const block = useMutation({
    mutationFn: () => api.messages.block(userId),
    onSuccess: () => {
      refresh()
      toast(`Blocked ${other.name}.`, {
        action: { label: 'Undo', onClick: () => unblock.mutate() },
      })
    },
  })
  const unblock = useMutation({
    mutationFn: () => api.messages.unblock(userId),
    onSuccess: refresh,
  })

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const body = draft.trim()
    if (body && !send.isPending) send.mutate(body)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a new line.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  useDocumentTitle(first ? `Messages · ${first.user.name}` : 'Messages')

  if (thread.isLoading) return <Spinner />
  if (thread.isError || !first)
    return <EmptyState icon="inbox" title="That conversation isn’t available" />

  const other = first.user
  const firstName = other.name.split(/\s+/)[0]
  const meta = [other.faculty, campusShort(other.campus)].filter(Boolean).join(' · ')

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={`Conversation with ${other.name}`}
    >
      <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        {back && (
          <Button
            variant="ghost"
            iconOnly
            icon="chevronLeft"
            to="/messages"
            aria-label="All messages"
          />
        )}
        <Link to={`/u/${other.id}`} className="flex min-w-0 items-center gap-3">
          <Avatar person={other} size={40} />
          <span className="flex min-w-0 flex-col">
            <b className="font-semibold text-ink">{other.name}</b>
            {meta && <span className="text-13 text-muted">{meta}</span>}
          </span>
        </Link>
        <span className="ml-auto" />
        <Menu
          width={240}
          trigger={({ toggle, open }) => (
            <Button
              variant="ghost"
              iconOnly
              icon="more"
              aria-label="Conversation options"
              aria-expanded={open}
              onClick={toggle}
            />
          )}
        >
          {(close) => (
            <>
              {first.closed === 'blocked' ? (
                <MenuItem icon="eye" onSelect={() => unblock.mutate()} close={close}>
                  Unblock {firstName}
                </MenuItem>
              ) : (
                <MenuItem
                  icon="eyeOff"
                  onSelect={async () =>
                    (await confirmAction({
                      title: `Block ${other.name}?`,
                      body: 'Neither of you can message the other until you unblock them. They won’t be told.',
                      confirmLabel: 'Block',
                      danger: true,
                    })) && block.mutate()
                  }
                  close={close}
                >
                  Block {firstName}
                </MenuItem>
              )}
              <MenuItem
                icon="flag"
                danger
                disabled={!first.canReport || first.reported}
                onSelect={() => setReporting(true)}
                close={close}
              >
                {first.reported ? 'Reported — a moderator will review it' : 'Report conversation'}
              </MenuItem>
            </>
          )}
        </Menu>
      </header>
      {reporting && <ReportConversationDialog person={other} onClose={() => setReporting(false)} />}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3.5 md:p-5">
        {thread.hasNextPage && (
          <div className="flex items-center justify-center">
            <Button
              size="sm"
              onClick={() => thread.fetchNextPage()}
              disabled={thread.isFetchingNextPage}
            >
              {thread.isFetchingNextPage ? 'Loading…' : 'Show earlier'}
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="m-auto text-center text-14 text-muted">
            Say hello — what you liked about their work is a good start.
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>

      {first.canMessage ? (
        <form
          className="flex items-end gap-2.5 border-t border-line px-3 pt-2.5 pb-3 md:px-5 md:pt-3.5 md:pb-4.5"
          onSubmit={submit}
        >
          <TextArea
            className="max-h-40 min-h-12 flex-1 resize-none"
            rows={2}
            value={draft}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Message ${firstName}`}
            aria-label="Message"
          />
          <Button
            type="submit"
            variant="primary"
            icon="send"
            disabled={!draft.trim() || send.isPending}
          >
            Send
          </Button>
        </form>
      ) : first.closed === 'blocked' ? (
        <Closed>
          <Icon name="eyeOff" size={15} /> You blocked {other.name}.
          <Button
            size="sm"
            variant="ghost"
            onClick={() => unblock.mutate()}
            disabled={unblock.isPending}
          >
            Unblock
          </Button>
        </Closed>
      ) : first.closed === 'suspended' ? (
        <Closed>
          <Icon name="lock" size={15} /> A moderator has suspended your messaging.
        </Closed>
      ) : (
        <Closed>
          <Icon name="lock" size={15} /> {other.name} isn’t taking new messages.
        </Closed>
      )}
      {(send.error || block.error || unblock.error) && (
        <ErrorText>{((send.error || block.error || unblock.error) as Error).message}</ErrorText>
      )}
    </section>
  )
}

/** The conversation's card: tall enough to scroll inside rather than the page. */
const threadCard = 'flex h-[calc(100vh-180px)] min-h-105 flex-col overflow-hidden'

/** /messages and /messages/:userId — the list beside the open conversation. */
export default function MessagesPage() {
  const { userId } = useParams<{ userId: string }>()
  const { user, maybeSignedIn } = useAuth()
  const phone = useMediaQuery(PHONE)
  useDocumentTitle('Messages')

  if (!user) return maybeSignedIn ? <Spinner /> : <Navigate to="/session" replace />
  if (userId === user.id) return <Navigate to="/messages" replace />

  // On a phone the list and the conversation are one screen each.
  const showList = !phone || !userId
  const showThread = !!userId

  return (
    <Page
      width="wide"
      className={cx(
        'grid grid-cols-1 items-start gap-5 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]',
        userId && 'max-md:p-0'
      )}
    >
      {showList && (
        <Card as="aside" className="overflow-hidden py-2">
          <Heading as="h1" className="px-5 pt-3 pb-2.5">
            Messages
          </Heading>
          <Conversations active={userId} />
        </Card>
      )}
      {showThread ? (
        <Card
          className={cx(
            threadCard,
            'max-md:h-[calc(100dvh-var(--spacing-header-mobile)-var(--spacing-bottom-nav))] max-md:min-h-0 max-md:rounded-none max-md:border-x-0'
          )}
        >
          <ThreadView key={userId} userId={userId!} back={phone} />
        </Card>
      ) : (
        !phone && (
          <Card className={cx(threadCard, 'justify-center')}>
            <EmptyState icon="inbox" title="Pick a conversation">
              Or start one from somebody’s profile.
            </EmptyState>
          </Card>
        )
      )}
    </Page>
  )
}
