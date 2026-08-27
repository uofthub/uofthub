import type { ProjectSummary } from '../lib/api'
import { Card, Chip, Icon, type ChipColor } from './ui'

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

export function Stat({ icon, value }: { icon: string; value: number | string }) {
  return (
    <span className="text--disabled" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8125rem' }}>
      <Icon name={icon} size={16} />
      {value}
    </span>
  )
}

/** The standard project tile used across the directory, profiles and orgs. */
export default function ProjectCard({ project, showOwner = true }: { project: ProjectSummary; showOwner?: boolean }) {
  return (
    <Card hover to={`/projects/${project.id}`} style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <h3 className="overflow-ellipsis" style={{ fontSize: '1.0625rem', fontWeight: 500 }}>
          {project.title}
        </h3>
        <VisibilityChip visibility={project.visibility} />
      </div>

      {project.description && (
        <p
          className="text--secondary"
          style={{
            fontSize: '0.9rem',
            margin: '6px 0 0',
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {project.tags.slice(0, 5).map(tag => (
            <Chip key={tag} small color="blue">
              {tag}
            </Chip>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        {showOwner && project.owner && (
          <span className="text--secondary overflow-ellipsis" style={{ fontSize: '0.8125rem' }}>
            {project.owner.name}
          </span>
        )}
        <Stat icon="mdi-heart-outline" value={project._count.likes} />
        <Stat icon="mdi-comment-outline" value={project._count.comments} />
        <span className="text--disabled" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>
          {new Date(project.createdAt).toLocaleDateString()}
        </span>
      </div>
    </Card>
  )
}

export function ProjectGrid({ projects, showOwner }: { projects: ProjectSummary[]; showOwner?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
      {projects.map(p => (
        <ProjectCard key={p.id} project={p} showOwner={showOwner} />
      ))}
    </div>
  )
}
