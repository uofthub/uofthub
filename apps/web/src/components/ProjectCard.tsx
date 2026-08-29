import type { ProjectSummary } from '../lib/api'
import { CAMPUS_LABELS } from '../lib/campus'
import { Avatar, Card, Chip, Icon, type ChipColor } from './ui'

const VISIBILITY: Record<string, { label: string; color: ChipColor }> = {
  PUBLIC: { label: 'Public', color: 'green' },
  UOFT: { label: 'U of T', color: 'blue' },
  PRIVATE: { label: 'Private', color: 'grey' },
}

export function VisibilityChip({ visibility }: { visibility: string }) {
  const v = VISIBILITY[visibility] ?? VISIBILITY.PRIVATE
  return (
    <Chip small color={v.color} style={{ fontWeight: 700 }}>
      {v.label}
    </Chip>
  )
}

/**
 * A count beside its icon. Renders nothing at zero: almost every project in a
 * young directory has no likes and no comments, and a wall of "0 0" is noise
 * that makes real engagement harder to spot, not easier.
 */
export function Stat({ icon, value }: { icon: string; value: number | string }) {
  if (!value) return null
  return (
    <span className="text--disabled" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8125rem' }}>
      <Icon name={icon} size={16} />
      {value}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Cover                                                                      */
/* -------------------------------------------------------------------------- */

const COVER_TONES: ChipColor[] = ['blue', 'purple', 'mint', 'orange', 'pink', 'green', 'yellow', 'red']

/**
 * The tone a coverless project falls back to. Derived from the id so a project
 * keeps the same colour on every visit and across every page it appears on —
 * a random one would make the directory flicker on each render.
 */
function toneFor(id: string): ChipColor {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return COVER_TONES[hash % COVER_TONES.length]
}

/**
 * A project's first uploaded image, or a monogram in its own colour. The
 * fallback matters more than the image: most projects have no files, and
 * without it their cards collapse to a title floating in white space.
 */
function Cover({
  project,
  height,
  width,
}: {
  project: ProjectSummary
  height: number | string
  width?: number
}) {
  const tone = `var(--tone-${toneFor(project.id)})`
  const shared = { width: width ?? '100%', height, flexShrink: 0, borderRadius: 8 } as const

  if (project.coverUrl) {
    return (
      <img
        src={project.coverUrl}
        alt=""
        loading="lazy"
        style={{ ...shared, objectFit: 'cover', background: 'var(--v-border-base)' }}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      style={{
        ...shared,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 26%, transparent), color-mix(in srgb, ${tone} 9%, transparent))`,
        color: tone,
        fontSize: typeof height === 'number' && height < 60 ? '1.125rem' : '2rem',
        fontWeight: 700,
      }}
    >
      {project.title.trim()[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function Meta({ project, showOwner }: { project: ProjectSummary; showOwner?: boolean }) {
  return (
    <>
      {/* Not a link to the profile, however much it wants to be: the whole
          card is already an anchor, and an <a> inside an <a> is invalid —
          the browser closes the outer one and the card stops being clickable. */}
      {showOwner && project.owner && (
        <span
          className="text--secondary overflow-ellipsis"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}
        >
          <Avatar name={project.owner.name} size={20} />
          {project.owner.name}
        </span>
      )}
      {/* Just the code — "UTM" is what a student reads it as, and the card has
          no room for "Mississauga" beside a name. */}
      {project.owner?.campus && (
        <span
          className="text--disabled"
          title={CAMPUS_LABELS[project.owner.campus]}
          style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em' }}
        >
          {project.owner.campus}
        </span>
      )}
      <Stat icon="mdi-heart-outline" value={project._count.likes} />
      <Stat icon="mdi-comment-outline" value={project._count.comments} />
      <Stat icon="mdi-eye-outline" value={project.viewCount} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Tile / row                                                                 */
/* -------------------------------------------------------------------------- */

/** The standard project tile used across the directory, profiles and orgs. */
export default function ProjectCard({ project, showOwner = true }: { project: ProjectSummary; showOwner?: boolean }) {
  return (
    <Card
      hover
      to={`/projects/${project.id}`}
      // Full height with the footer pushed down, so a project with no
      // description doesn't leave a hole where the tallest card in its row is.
      style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Cover project={project} height={124} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
        <h3 className="overflow-ellipsis" style={{ fontSize: '1rem', fontWeight: 600 }}>
          {project.title}
        </h3>
        <VisibilityChip visibility={project.visibility} />
      </div>

      {project.description && (
        <p
          className="text--secondary"
          style={{
            fontSize: '0.875rem',
            margin: '4px 0 0',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {project.description}
        </p>
      )}

      {project.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {project.tags.slice(0, 3).map(tag => (
            <Chip key={tag} small color="blue">
              {tag}
            </Chip>
          ))}
          {project.tags.length > 3 && (
            <span className="text--disabled" style={{ fontSize: '0.75rem', alignSelf: 'center' }}>
              +{project.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 'auto',
          paddingTop: 12,
          minWidth: 0,
        }}
      >
        <Meta project={project} showOwner={showOwner} />
        <span className="text--disabled" style={{ marginLeft: 'auto', fontSize: '0.75rem', flexShrink: 0 }}>
          {new Date(project.createdAt).toLocaleDateString()}
        </span>
      </div>
    </Card>
  )
}

/** The same project as a single dense row, for the directory's list view. */
export function ProjectRow({ project, showOwner = true }: { project: ProjectSummary; showOwner?: boolean }) {
  return (
    <Card hover to={`/projects/${project.id}`} style={{ padding: 12, display: 'flex', gap: 14, alignItems: 'center' }}>
      <Cover project={project} height={56} width={72} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 className="overflow-ellipsis" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
            {project.title}
          </h3>
          <VisibilityChip visibility={project.visibility} />
        </div>

        {project.description && (
          <p className="text--secondary overflow-ellipsis" style={{ fontSize: '0.8125rem', margin: '2px 0 0' }}>
            {project.description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
          <Meta project={project} showOwner={showOwner} />
          {project.tags.slice(0, 3).map(tag => (
            <Chip key={tag} small color="blue">
              {tag}
            </Chip>
          ))}
        </div>
      </div>

      <span className="text--disabled" style={{ fontSize: '0.75rem', flexShrink: 0 }}>
        {new Date(project.createdAt).toLocaleDateString()}
      </span>
    </Card>
  )
}

export function ProjectGrid({
  projects,
  showOwner,
  view = 'grid',
}: {
  projects: ProjectSummary[]
  showOwner?: boolean
  view?: 'grid' | 'list'
}) {
  if (view === 'list') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {projects.map(p => (
          <ProjectRow key={p.id} project={p} showOwner={showOwner} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {projects.map(p => (
        <ProjectCard key={p.id} project={p} showOwner={showOwner} />
      ))}
    </div>
  )
}
