import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CommentThread } from '@uofthub/types'
import { api, type ProjectDetail, type ProjectVersion } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { courseOf, postedAt, timeAgo, timeShort, topicTags } from '../../lib/projectView'
import { MiniRow } from '../../components/project'
import {
  Avatar,
  Badge,
  Button,
  cx,
  ErrorText,
  Heading,
  Icon,
  Input,
  LinkButton,
  Panel,
} from '../../components/ui'

/* --------------------------------- updates --------------------------------- */

function Node({
  title,
  when,
  children,
  last,
}: {
  title: string
  when: string
  children?: string
  last?: boolean
}) {
  return (
    <div className="relative pl-8">
      <span className="absolute top-1 left-0 size-4 rounded-full border-3 border-navy-ink bg-surface" />
      {!last && <span className="absolute top-5.5 -bottom-4.5 left-1.75 w-0.5 bg-line" />}
      <div className="flex items-baseline gap-2.5">
        <b className="text-15">{title}</b>
        <span className="text-13 text-muted">{when}</span>
      </div>
      {children && <div className="mt-0.5 text-15 text-ink-3">{children}</div>}
    </div>
  )
}

/**
 * The project's updates, newest first, ending at the day it went out. Each is
 * a version the owner saved with a note about what changed.
 */
export function Updates({
  project,
  versions,
  isOwner,
  onPost,
}: {
  project: ProjectDetail
  versions: ProjectVersion[]
  isOwner: boolean
  onPost: () => void
}) {
  return (
    <Panel
      title="Updates"
      size="main"
      action={
        isOwner ? (
          <Button size="sm" icon="send" onClick={onPost}>
            Post an update
          </Button>
        ) : (
          <FollowUpdatesButton project={project} />
        )
      }
      id="updates"
    >
      {versions.map((v) => (
        <Node key={v.id} title={`v${v.versionNum}`} when={timeAgo(v.createdAt)}>
          {v.note ?? 'Saved a new version'}
        </Node>
      ))}
      <Node
        title={project.publishedAt ? 'Published' : 'Created'}
        when={timeAgo(postedAt(project))}
        last
      >
        {project.pitch ?? undefined}
      </Node>
    </Panel>
  )
}

/**
 * "Tell me when this posts an update." Private to the follower — the owner
 * sees only a count in Insights.
 */
function FollowUpdatesButton({ project }: { project: ProjectDetail }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: () => api.projects.followUpdates(project.id),
    onSuccess: ({ following }) =>
      qc.setQueryData<ProjectDetail>(['project', project.id], (p) => (p ? { ...p, following } : p)),
  })
  const following = project.following ?? false
  return (
    <Button
      size="sm"
      icon={following ? 'check' : 'bell'}
      variant={following ? 'ghost' : 'default'}
      aria-pressed={following}
      onClick={() => (user ? toggle.mutate() : navigate('/session'))}
      disabled={toggle.isPending}
      title={following ? 'You’ll be told when this posts an update' : undefined}
    >
      {following ? 'Following updates' : 'Follow updates'}
    </Button>
  )
}

/* --------------------------------- comments -------------------------------- */

type ThreadComment = CommentThread | CommentThread['replies'][number]

/** Helpful and Reply under a comment: quieter than the app's other text buttons. */
const commentAction = 'text-13 text-muted hover:text-muted'

function CommentItem({
  project,
  comment,
  small,
  onReply,
}: {
  project: ProjectDetail
  comment: ThreadComment
  small?: boolean
  onReply?: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const author = comment.userId === project.ownerId
  const name = comment.user?.name ?? 'Someone'
  const mine = user?.id === comment.userId

  const helpful = useMutation({
    mutationFn: () => api.projects.helpful(project.id, comment.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', project.id] }),
  })

  return (
    <div className={cx('flex items-start gap-3', small && 'ml-14')}>
      <Link to={`/u/${comment.userId}`} tabIndex={-1} aria-hidden="true">
        <Avatar
          person={{ id: comment.userId, name, avatarUrl: comment.user?.avatarUrl }}
          size={small ? 32 : 40}
        />
      </Link>
      <div className="flex min-w-0 grow flex-col gap-1">
        <div className="text-14">
          <Link to={`/u/${comment.userId}`} className="font-semibold text-ink">
            {name}
          </Link>
          {author && (
            <Badge bg="#E6EBF4" ink="#1E3765" className="ml-1.5">
              Author
            </Badge>
          )}{' '}
          <span className="text-muted">
            · {[comment.user?.faculty, timeShort(comment.createdAt)].filter(Boolean).join(' · ')}
          </span>
        </div>
        <p className="text-15 leading-[1.55] wrap-anywhere whitespace-pre-wrap">{comment.body}</p>
        <div className="flex gap-4">
          <LinkButton
            className={cx(
              commentAction,
              comment.helpfulByMe && 'text-navy-ink hover:text-navy-ink'
            )}
            aria-pressed={comment.helpfulByMe}
            disabled={!user || mine || helpful.isPending}
            title={mine ? 'Your own comment' : user ? 'Mark as helpful' : 'Sign in to vote'}
            onClick={() => helpful.mutate()}
          >
            <Icon name="bulb" size={14} />
            Helpful{comment.helpfulCount > 0 && ` · ${comment.helpfulCount}`}
          </LinkButton>
          {user && onReply && (
            <LinkButton className={commentAction} onClick={onReply}>
              Reply
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  )
}

export function Comments({ project }: { project: ProjectDetail }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const { data: threads = [] } = useQuery({
    queryKey: ['comments', project.id],
    queryFn: () => api.projects.comments(project.id),
  })
  const count = threads.reduce((n, t) => n + 1 + t.replies.length, 0)

  const post = useMutation({
    mutationFn: () => api.projects.addComment(project.id, body.trim(), replyTo?.id),
    onSuccess: () => {
      setBody('')
      setReplyTo(null)
      qc.invalidateQueries({ queryKey: ['comments', project.id] })
      qc.invalidateQueries({ queryKey: ['project', project.id] })
    },
  })

  const reply = (c: ThreadComment) => {
    setReplyTo({ id: c.id, name: c.user?.name ?? 'them' })
    input.current?.focus()
  }

  return (
    <Panel id="comments" size="main" className="gap-5">
      <Heading className="text-18">
        {count} {count === 1 ? 'comment' : 'comments'}
      </Heading>

      {threads.map((t) => (
        <div key={t.id} className="flex flex-col gap-4">
          <CommentItem project={project} comment={t} onReply={() => reply(t)} />
          {t.replies.map((r) => (
            <CommentItem key={r.id} project={project} comment={r} small onReply={() => reply(r)} />
          ))}
        </div>
      ))}

      {user ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim()) post.mutate()
          }}
        >
          {replyTo && (
            <span className="flex items-center gap-1.5 text-13 text-muted">
              Replying to {replyTo.name}
              <LinkButton onClick={() => setReplyTo(null)}>Cancel</LinkButton>
            </span>
          )}
          <div className="flex items-center gap-3">
            <Avatar person={user} size={40} />
            <label className="min-w-0 grow">
              <span className="sr-only">
                {replyTo ? `Reply to ${replyTo.name}` : 'Add a comment'}
              </span>
              <Input
                inputRef={input}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  replyTo
                    ? `Reply to ${replyTo.name}`
                    : 'Answer the author’s question or leave feedback'
                }
                maxLength={4000}
              />
            </label>
            <Button type="submit" variant="primary" disabled={!body.trim() || post.isPending}>
              {post.isPending ? 'Posting…' : replyTo ? 'Reply' : 'Post'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-14 text-muted">
          <Link to="/session">Sign in</Link> to leave feedback.
        </p>
      )}
      {post.isError && <ErrorText>{(post.error as Error).message}</ErrorText>}
    </Panel>
  )
}

/* --------------------------------- related --------------------------------- */

/** "More built for CSC309" and "You might also like". */
export function Related({ project }: { project: ProjectDetail }) {
  const course = courseOf(project)
  const topic = topicTags(project)[0]

  const { data: sameCourse = [] } = useQuery({
    queryKey: ['projects', { course, take: 6 }],
    queryFn: () => api.projects.list({ course, take: 6 }),
    enabled: !!course,
  })
  const courseRows = sameCourse.filter((p) => p.id !== project.id).slice(0, 3)

  const { data: similar = [] } = useQuery({
    queryKey: ['projects', topic ? { search: topic, take: 8 } : { sort: 'trending', take: 8 }],
    queryFn: () =>
      topic
        ? api.projects.list({ search: topic, take: 8 })
        : api.projects.list({ sort: 'trending', take: 8 }),
  })
  const shown = new Set([project.id, ...courseRows.map((p) => p.id)])
  const similarRows = similar.filter((p) => !shown.has(p.id)).slice(0, 3)

  return (
    <>
      {courseRows.length > 0 && (
        <Panel title={`More built for ${course}`} className="px-5.5 py-5">
          {courseRows.map((p) => (
            <MiniRow key={p.id} project={p} />
          ))}
          <Link
            to={`/explore?course=${encodeURIComponent(course!)}`}
            className="text-14 font-semibold"
          >
            See all →
          </Link>
        </Panel>
      )}
      {similarRows.length > 0 && (
        <Panel title="You might also like" className="px-5.5 py-5">
          {similarRows.map((p) => (
            <MiniRow key={p.id} project={p} />
          ))}
        </Panel>
      )}
    </>
  )
}
