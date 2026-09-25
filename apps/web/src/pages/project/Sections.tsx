import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CommentThread } from '@uofthub/types'
import { api, type ProjectDetail, type ProjectVersion } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { courseOf, postedAt, timeAgo, timeShort, topicTags } from '../../lib/projectView'
import { MiniRow } from '../../components/project'
import { Avatar, Badge, Button, ErrorText, Icon, Input, Panel } from '../../components/ui'

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
    <div className="tl-node">
      <span className="tl-node__dot" />
      {!last && <span className="tl-node__line" />}
      <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
        <b style={{ fontSize: 15 }}>{title}</b>
        <span className="muted" style={{ fontSize: 13 }}>
          {when}
        </span>
      </div>
      {children && <div className="tl-node__text">{children}</div>}
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
    <div className="row" style={{ gap: 12, alignItems: 'flex-start', marginLeft: small ? 56 : 0 }}>
      <Link to={`/u/${comment.userId}`} tabIndex={-1} aria-hidden="true">
        <Avatar
          person={{ id: comment.userId, name, avatarUrl: comment.user?.avatarUrl }}
          size={small ? 32 : 40}
        />
      </Link>
      <div className="stack grow" style={{ gap: 4 }}>
        <div style={{ fontSize: 14 }}>
          <Link to={`/u/${comment.userId}`} style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {name}
          </Link>
          {author && (
            <Badge bg="#E6EBF4" ink="#1E3765" style={{ marginLeft: 6 }}>
              Author
            </Badge>
          )}{' '}
          <span className="muted">
            · {[comment.user?.faculty, timeShort(comment.createdAt)].filter(Boolean).join(' · ')}
          </span>
        </div>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {comment.body}
        </p>
        <div className="comment-actions">
          <button
            type="button"
            className={comment.helpfulByMe ? 'link-btn link-btn--on' : 'link-btn'}
            aria-pressed={comment.helpfulByMe}
            disabled={!user || mine || helpful.isPending}
            title={mine ? 'Your own comment' : user ? 'Mark as helpful' : 'Sign in to vote'}
            onClick={() => helpful.mutate()}
          >
            <Icon name="bulb" size={14} />
            Helpful{comment.helpfulCount > 0 && ` · ${comment.helpfulCount}`}
          </button>
          {user && onReply && (
            <button type="button" className="link-btn" onClick={onReply}>
              Reply
            </button>
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
    <Panel id="comments" size="main" gap={20}>
      <h2 className="h2" style={{ fontSize: 18 }}>
        {count} {count === 1 ? 'comment' : 'comments'}
      </h2>

      {threads.map((t) => (
        <div key={t.id} className="stack" style={{ gap: 16 }}>
          <CommentItem project={project} comment={t} onReply={() => reply(t)} />
          {t.replies.map((r) => (
            <CommentItem key={r.id} project={project} comment={r} small onReply={() => reply(r)} />
          ))}
        </div>
      ))}

      {user ? (
        <form
          className="stack"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim()) post.mutate()
          }}
        >
          {replyTo && (
            <span className="muted row" style={{ gap: 6, fontSize: 13 }}>
              Replying to {replyTo.name}
              <button type="button" className="link-btn" onClick={() => setReplyTo(null)}>
                Cancel
              </button>
            </span>
          )}
          <div className="row" style={{ gap: 12 }}>
            <Avatar person={user} size={40} />
            <label className="grow">
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
        <p className="muted" style={{ fontSize: 14 }}>
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
  const course = courseOf(project.tags)
  const topic = topicTags(project.tags)[0]

  const { data: sameCourse = [] } = useQuery({
    queryKey: ['projects', { search: course, take: 6 }],
    queryFn: () => api.projects.list({ search: course, take: 6 }),
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
        <Panel title={`More built for ${course}`} style={{ padding: '20px 22px' }}>
          {courseRows.map((p) => (
            <MiniRow key={p.id} project={p} />
          ))}
          <Link
            to={`/explore?course=${encodeURIComponent(course!)}`}
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            See all →
          </Link>
        </Panel>
      )}
      {similarRows.length > 0 && (
        <Panel title="You might also like" style={{ padding: '20px 22px' }}>
          {similarRows.map((p) => (
            <MiniRow key={p.id} project={p} />
          ))}
        </Panel>
      )}
    </>
  )
}
