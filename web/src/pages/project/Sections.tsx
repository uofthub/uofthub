import { Fragment, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CommentThread } from '@uofthub/types'
import { api, type ProjectDetail, type ProjectVersion } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { describeChange } from '../../lib/changes'
import { courseOf, postedAt, timeAgo, timeShort, topicTags } from '../../lib/projectView'
import { MiniRow, ReportDialog } from '../../components/project'
import Markdown from '../../components/Markdown'
import {
  Avatar,
  Badge,
  Button,
  cx,
  Dialog,
  ErrorText,
  Heading,
  Icon,
  Input,
  LinkButton,
  Panel,
  TextArea,
  confirmAction,
  toast,
} from '../../components/ui'

/* --------------------------------- updates --------------------------------- */

function Node({
  title,
  when,
  children,
  last,
  onOpen,
}: {
  title: string
  when: string
  children?: ReactNode
  last?: boolean
  /** Opens what the project said at this point. */
  onOpen?: () => void
}) {
  return (
    <div className="relative pl-8">
      <span className="absolute top-1 left-0 size-4 rounded-full border-3 border-navy-ink bg-surface" />
      {!last && <span className="absolute top-5.5 -bottom-4.5 left-1.75 w-0.5 bg-line" />}
      <div className="flex items-baseline gap-2.5">
        {onOpen ? (
          <LinkButton className="text-15 font-bold" onClick={onOpen}>
            {title}
          </LinkButton>
        ) : (
          <b className="text-15">{title}</b>
        )}
        <span className="text-13 text-muted">{when}</span>
      </div>
      {children && <div className="mt-0.5 text-15 text-ink-3">{children}</div>}
    </div>
  )
}

/**
 * The project's updates, newest first, ending at the day it went out. Each is
 * a version: one its makers posted with a note, or one an edit recorded on
 * its own with a list of what changed.
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
  const [viewing, setViewing] = useState<ProjectVersion | null>(null)
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
      {viewing && (
        <VersionDialog
          project={project}
          version={viewing}
          canRestore={isOwner}
          onClose={() => setViewing(null)}
        />
      )}
      {versions.map((v) => (
        <Node
          key={v.id}
          title={`v${v.versionNum}`}
          when={timeAgo(v.createdAt)}
          onOpen={() => setViewing(v)}
        >
          {v.note ??
            (v.changes?.length ? (
              <ul className="flex flex-col gap-0.5">
                {v.changes.map((c, i) => (
                  <li key={i}>{describeChange(c)}</li>
                ))}
              </ul>
            ) : (
              'Saved a new version'
            ))}
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
 * What the project said at one version, and — for its makers — putting that
 * back. Files and outputs are named, not restored: they may be gone.
 */
function VersionDialog({
  project,
  version,
  canRestore,
  onClose,
}: {
  project: ProjectDetail
  version: ProjectVersion
  canRestore: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const restore = useMutation({
    mutationFn: () => api.projects.restoreVersion(project.id, version.versionNum),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      qc.invalidateQueries({ queryKey: ['versions', project.id] })
      onClose()
      toast('Version restored.')
    },
  })
  return (
    <Dialog
      title={`v${version.versionNum} · ${new Date(version.createdAt).toLocaleDateString()}`}
      onClose={onClose}
      width={680}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {canRestore && (
            <Button
              variant="primary"
              disabled={restore.isPending}
              onClick={async () =>
                (await confirmAction({
                  title: 'Restore this version?',
                  body: 'Its text, details, tags and references come back. What’s there now is saved as a new version first, so nothing is lost.',
                  confirmLabel: 'Restore',
                })) && restore.mutate()
              }
            >
              {restore.isPending ? 'Restoring…' : 'Restore this version'}
            </Button>
          )}
        </>
      }
    >
      {version.note && <p className="text-15 font-semibold">{version.note}</p>}
      <h3 className="font-display text-24 font-bold">{version.title}</h3>
      {version.courseCode && <p className="text-14 text-muted">Made for {version.courseCode}</p>}
      {version.description && <Markdown source={version.description} />}
      {(version.sections ?? []).map((sec) => (
        <section key={sec.id} className="flex flex-col gap-1.5">
          <Heading className="text-18">{sec.title || sec.kind}</Heading>
          {sec.body && <Markdown source={sec.body} />}
        </section>
      ))}
      {(version.details ?? []).length > 0 && (
        <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-14">
          {version.details!.map((d, i) => (
            <Fragment key={i}>
              <dt className="text-muted">{d.label}</dt>
              <dd>{d.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {(version.references ?? []).length > 0 && (
        <p className="text-14 text-muted">
          References: {version.references!.map((r) => r.title).join(' · ')}
        </p>
      )}
      {(version.outputs ?? []).length > 0 && (
        <p className="text-14 text-muted">
          Outputs then:{' '}
          {version.outputs!.map((o) => o.label || o.file || o.link?.label || o.kind).join(' · ')}
        </p>
      )}
      {version.tags.length > 0 && <p className="text-14 text-muted">#{version.tags.join(' #')}</p>}
      {restore.isError && <ErrorText>{restore.error.message}</ErrorText>}
    </Dialog>
  )
}

/**
 * "Tell me when this changes": posted updates, and what its makers' edits
 * changed — once per sitting (api/src/lib/versions.ts). Private to the
 * follower; the owner sees only a count in Insights.
 */
export function FollowUpdatesButton({
  project,
  compact = false,
}: {
  project: ProjectDetail
  /** The bell alone, beside the bookmark at the top of the page. */
  compact?: boolean
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: () => api.projects.followUpdates(project.id),
    onSuccess: ({ following }) =>
      qc.setQueryData<ProjectDetail>(['project', project.id], (p) => (p ? { ...p, following } : p)),
  })
  const following = project.following ?? false
  const hint = following
    ? 'Following — you’re told when this changes. Press to stop.'
    : 'Follow — get told in the app when this changes'
  return (
    <Button
      size={compact ? 'lg' : 'sm'}
      iconOnly={compact}
      icon="bell"
      variant={following && !compact ? 'ghost' : 'default'}
      aria-pressed={following}
      aria-label={compact ? hint : undefined}
      onClick={() => (user ? toggle.mutate() : navigate('/session'))}
      disabled={toggle.isPending}
      title={hint}
      className={cx(
        compact &&
          following &&
          'border-navy-soft bg-navy-tint text-navy-ink hover:bg-navy-tint hover:text-navy-ink [&_svg]:fill-current'
      )}
    >
      {compact ? undefined : following ? 'Following' : 'Follow'}
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
  const [editing, setEditing] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const author = comment.userId === project.ownerId
  const name = comment.user?.name ?? 'Someone'
  const mine = !!user && user.id === comment.userId
  // Its author, the project's owner or a moderator may remove it.
  const canDelete = mine || user?.id === project.ownerId || !!user?.isAdmin
  const refresh = () => qc.invalidateQueries({ queryKey: ['comments', project.id] })

  const helpful = useMutation({
    mutationFn: () => api.projects.helpful(project.id, comment.id),
    onSuccess: refresh,
  })
  const save = useMutation({
    mutationFn: (body: string) => api.projects.editComment(project.id, comment.id, body),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: () => api.projects.deleteComment(project.id, comment.id),
    onSuccess: () => {
      refresh()
      qc.invalidateQueries({ queryKey: ['project', project.id] })
    },
  })

  if (comment.deleted)
    return (
      <div className={cx('flex items-center gap-3', small && 'ml-14')}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill text-muted">
          <Icon name="trash" size={16} />
        </span>
        <p className="text-14 text-muted italic">This comment was deleted.</p>
      </div>
    )

  return (
    <div className={cx('flex items-start gap-3', small && 'ml-14')}>
      {reporting && (
        <ReportDialog
          target={{ kind: 'comment', projectId: project.id, commentId: comment.id }}
          onClose={() => setReporting(false)}
        />
      )}
      <Link to={`/u/${comment.userId}`} tabIndex={-1} aria-hidden="true">
        <Avatar
          person={{ id: comment.userId ?? undefined, name, avatarUrl: comment.user?.avatarUrl }}
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
            ·{' '}
            {[comment.user?.faculty, timeShort(comment.createdAt), comment.editedAt && 'edited']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {editing !== null ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (editing.trim()) save.mutate(editing.trim())
            }}
          >
            <TextArea
              rows={3}
              maxLength={4000}
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              aria-label="Edit your comment"
            />
            <span className="flex gap-2">
              <Button
                size="sm"
                type="submit"
                variant="primary"
                disabled={!editing.trim() || save.isPending}
              >
                Save
              </Button>
              <Button size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </span>
          </form>
        ) : (
          <p className="text-15 leading-[1.55] wrap-anywhere whitespace-pre-wrap">{comment.body}</p>
        )}
        <div className="flex flex-wrap gap-4">
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
          {mine && editing === null && (
            <LinkButton className={commentAction} onClick={() => setEditing(comment.body)}>
              Edit
            </LinkButton>
          )}
          {canDelete && (
            <LinkButton
              className={commentAction}
              disabled={remove.isPending}
              onClick={async () =>
                (await confirmAction({
                  title: 'Delete this comment?',
                  confirmLabel: 'Delete',
                  danger: true,
                })) && remove.mutate()
              }
            >
              Delete
            </LinkButton>
          )}
          {user && !mine && (
            <LinkButton className={commentAction} onClick={() => setReporting(true)}>
              Report
            </LinkButton>
          )}
        </div>
        {(save.isError || remove.isError) && (
          <ErrorText>{(save.error ?? remove.error)!.message}</ErrorText>
        )}
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
