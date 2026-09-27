import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProjectStatus, ProjectType } from '@uofthub/types'
import { api, type ProjectSummary } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { PROJECT_STATUSES, PROJECT_TYPES } from '../../lib/projectMeta'
import { Badge, Button, cx, Icon, Pill } from '../ui'

/**
 * The star and comment counts at the foot of a card. The star is the
 * project's reaction total — the app's one public engagement number. Zeros
 * are hidden: a young directory is mostly zeros, and a wall of them buries
 * the counts that mean something.
 */
export function ProjectStats({
  project,
}: {
  project: Pick<ProjectSummary, '_count' | 'reactionTotal'>
}) {
  const reactions = project.reactionTotal
  const comments = project._count.comments
  if (!reactions && !comments) return null
  return (
    <span className="flex items-center gap-3.5 text-13 text-muted">
      {reactions > 0 && (
        <span className="flex items-center gap-1" aria-label={`${reactions} reactions`}>
          <Icon name="star" size={15} />
          {reactions}
        </span>
      )}
      {comments > 0 && (
        <span className="flex items-center gap-1" aria-label={`${comments} comments`}>
          <Icon name="comment" size={15} />
          {comments}
        </span>
      )}
    </span>
  )
}

export function TypeBadge({ type }: { type?: ProjectType | null }) {
  if (!type) return null
  const t = PROJECT_TYPES[type]
  return (
    <Badge bg={t.bg} ink={t.ink}>
      {t.badge}
    </Badge>
  )
}

export function StatusPill({ status }: { status?: ProjectStatus | null }) {
  if (!status) return null
  const s = PROJECT_STATUSES[status]
  return <Pill dot={s.dot}>{s.label}</Pill>
}

/**
 * Not on the boards, which only ever show other people's published work. A
 * student looking at their own profile has to be able to tell a draft or a
 * link-only project apart.
 */
export function VisibilityPill({ visibility }: { visibility: string }) {
  if (visibility === 'PRIVATE') return <Pill dot="#8A8E98">Draft</Pill>
  if (visibility === 'UNLISTED') return <Pill dot="#8A8E98">Unlisted</Pill>
  return null
}

/**
 * What a project looking for help wants a hand with, under a card's pitch —
 * the line the Looking for help list is for. Nothing when it hasn't said.
 */
export function HelpNeeded({
  project,
  clamp = 'line-clamp-2',
}: {
  project: Pick<ProjectSummary, 'status' | 'helpNeeded'>
  clamp?: string
}) {
  if (project.status !== 'HELP_WANTED' || !project.helpNeeded) return null
  return (
    <p className={cx('flex gap-1.5 text-14 leading-[1.45] text-navy-ink', clamp)}>
      <Icon name="megaphone" size={15} className="mt-0.5 shrink-0" />
      <span>
        <b>Needs:</b> {project.helpNeeded}
      </span>
    </p>
  )
}

/** The row every card opens with: type on the left, where it stands on the right. */
export function CardTop({
  project,
}: {
  project: Pick<ProjectSummary, 'type' | 'status' | 'visibility'>
}) {
  const hidden = project.visibility === 'PRIVATE' || project.visibility === 'UNLISTED'
  if (!project.type && !project.status && !hidden) return null
  return (
    <div className="flex items-center justify-between gap-1.5">
      <TypeBadge type={project.type} />
      <span className="ml-auto flex items-center gap-1.5">
        <VisibilityPill visibility={project.visibility} />
        <StatusPill status={project.status} />
      </span>
    </div>
  )
}

/**
 * The bookmark. Private to whoever pressed it — the owner is never told and
 * no count is shown anywhere.
 */
export function SaveButton({
  project,
  size = 'md',
}: {
  project: Pick<ProjectSummary, 'id' | 'saved'>
  size?: 'md' | 'lg'
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [saved, setSaved] = useState(project.saved)
  // A refetch that brings a different answer (saved on another page) wins.
  const [lastProp, setLastProp] = useState(project.saved)
  if (project.saved !== lastProp) {
    setLastProp(project.saved)
    setSaved(project.saved)
  }

  const toggle = useMutation({
    mutationFn: () => api.projects.save(project.id),
    onMutate: () => setSaved((s) => !s),
    onSuccess: (res) => {
      setSaved(res.saved)
      qc.invalidateQueries({ queryKey: ['saved'] })
    },
    onError: () => setSaved((s) => !s),
  })

  return (
    <Button
      size={size}
      iconOnly
      icon="bookmark"
      aria-label={saved ? 'Saved — remove from saved' : 'Save'}
      aria-pressed={saved}
      title={saved ? 'Saved' : 'Save'}
      className={cx(
        saved &&
          'border-navy-soft bg-navy-tint text-navy-ink hover:bg-navy-tint hover:text-navy-ink [&_svg]:fill-current'
      )}
      onClick={() => (user ? toggle.mutate() : navigate('/session'))}
      disabled={toggle.isPending}
    />
  )
}

export type CardLayout = 'card' | 'list'

/** The two square buttons that switch a list between cards and rows. */
export function LayoutToggle({
  value,
  onChange,
  label = true,
}: {
  value: CardLayout
  onChange: (v: CardLayout) => void
  label?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {label && <span className="mr-1.5 text-13 text-muted">Layout</span>}
      {(['card', 'list'] as const).map((v) => (
        <Button
          key={v}
          size="md"
          iconOnly
          icon={v === 'card' ? 'grid' : 'list'}
          aria-label={v === 'card' ? 'Card layout' : 'List layout'}
          aria-pressed={value === v}
          variant={value === v ? 'primary' : 'default'}
          onClick={() => onChange(v)}
        />
      ))}
    </div>
  )
}
