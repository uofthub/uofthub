import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Conversation, type Message } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { PHONE, useDocumentTitle, useMediaQuery } from '../../lib/hooks'
import { timeShort } from '../../lib/projectView'
import { Avatar, Button, EmptyState, ErrorText, Icon, Spinner, cx } from '../../components/ui'
import './messages.css'

const MESSAGE_MAX = 2000

/** The conversation list: newest first, bold while unread. */
function Conversations({ active }: { active?: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['messages', 'conversations'],
    queryFn: () => api.messages.conversations(),
    refetchInterval: 30_000,
  })
  if (isLoading) return <Spinner />
  if (data.length === 0)
    return (
      <p className="muted" style={{ padding: 20, fontSize: 14 }}>
        No conversations yet. Message someone from their profile — a “Want to collab” is a good
        place to start.
      </p>
    )
  return (
    <ul className="convos">
      {data.map((c: Conversation) => (
        <li key={c.user.id}>
          <Link
            to={`/messages/${c.user.id}`}
            className={cx('convo', c.user.id === active && 'convo--active')}
            aria-current={c.user.id === active ? 'page' : undefined}
          >
            <Avatar person={c.user} size={44} />
            <span className="convo__body">
              <span className="convo__top">
                <b className={cx('convo__name', c.unread > 0 && 'convo__name--unread')}>
                  {c.user.name}
                </b>
                <span className="muted convo__when">{timeShort(c.lastMessage.createdAt)}</span>
              </span>
              <span className={cx('convo__last', c.unread > 0 && 'convo__last--unread')}>
                {c.lastMessage.fromMe && 'You: '}
                {c.lastMessage.body}
              </span>
            </span>
            {c.unread > 0 && (
              <span className="convo__badge" aria-label={`${c.unread} unread`}>
                {c.unread}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** One conversation, oldest at the top, with "Show earlier" going back a page at a time. */
function ThreadView({ userId, back }: { userId: string; back: boolean }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const thread = useInfiniteQuery({
    queryKey: ['messages', 'thread', userId],
    queryFn: ({ pageParam }) => api.messages.thread(userId, pageParam),
    initialPageParam: undefined as string | undefined,
    // Each page is older than the one before; its first message is where the next starts.
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
    refetchInterval: 10_000,
  })
  const first = thread.data?.pages[0]
  const messages: Message[] = (thread.data?.pages ?? [])
    .slice()
    .reverse()
    .flatMap((p) => p.messages)
  const newest = messages[messages.length - 1]?.id

  // Opening a conversation reads it; the badges should agree.
  useEffect(() => {
    if (!first) return
    qc.invalidateQueries({ queryKey: ['messages', 'unread'] })
    qc.invalidateQueries({ queryKey: ['messages', 'conversations'] })
  }, [first, qc])

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
  const meta = [other.faculty, campusShort(other.campus)].filter(Boolean).join(' · ')

  return (
    <section className="thread" aria-label={`Conversation with ${other.name}`}>
      <header className="thread__head">
        {back && (
          <Button
            variant="ghost"
            iconOnly
            icon="chevronLeft"
            to="/messages"
            aria-label="All messages"
          />
        )}
        <Link to={`/u/${other.id}`} className="row" style={{ gap: 12, minWidth: 0 }}>
          <Avatar person={other} size={40} />
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <b className="thread__name">{other.name}</b>
            {meta && (
              <span className="muted" style={{ fontSize: 13 }}>
                {meta}
              </span>
            )}
          </span>
        </Link>
      </header>

      <div className="thread__body">
        {thread.hasNextPage && (
          <div className="row" style={{ justifyContent: 'center' }}>
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
          <p className="muted" style={{ textAlign: 'center', fontSize: 14, margin: 'auto' }}>
            Say hello — what you liked about their work is a good start.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx('bubble', m.fromMe ? 'bubble--me' : 'bubble--them')}>
            <p>{m.body}</p>
            <span className="bubble__when">{timeShort(m.createdAt)}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {first.canMessage ? (
        <form className="thread__compose" onSubmit={submit}>
          <textarea
            className="inp"
            rows={2}
            value={draft}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Message ${other.name.split(/\s+/)[0]}`}
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
      ) : (
        <p className="thread__closed muted">
          <Icon name="lock" size={15} /> {other.name} isn’t taking new messages.
        </p>
      )}
      {send.isError && <ErrorText>{(send.error as Error).message}</ErrorText>}
    </section>
  )
}

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
    <div className={cx('page page--wide messages', userId && 'messages--open')}>
      {showList && (
        <aside className="card messages__list">
          <h1 className="h2 messages__title">Messages</h1>
          <Conversations active={userId} />
        </aside>
      )}
      {showThread ? (
        <div className="card messages__thread">
          <ThreadView key={userId} userId={userId!} back={phone} />
        </div>
      ) : (
        !phone && (
          <div className="card messages__thread messages__empty">
            <EmptyState icon="inbox" title="Pick a conversation">
              Or start one from somebody’s profile.
            </EmptyState>
          </div>
        )
      )}
    </div>
  )
}
