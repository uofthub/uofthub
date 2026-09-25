import { Link } from 'react-router-dom'
import type { CollectionSummary } from '../../lib/api'
import { campusShort } from '../../lib/campus'
import { Cover } from '../project/Cover'
import { Icon } from '../ui'

/** Three covers fanned out, as on the Explore board. */
export function CoverStack({
  projects,
  height = 112,
}: {
  projects: CollectionSummary['preview']
  height?: number
}) {
  if (projects.length === 0)
    return (
      <span className="cover-stack cover-stack--empty" aria-hidden="true">
        <Icon name="layers" size={28} />
      </span>
    )
  return (
    <span className="cover-stack" aria-hidden="true" style={{ height: height + 26 }}>
      {projects.slice(0, 3).map((p, i) => (
        <span key={p.id} className="stacked-cover" style={{ left: i * 34, top: i * 10 }}>
          <Cover project={p} height={height} />
        </span>
      ))}
    </span>
  )
}

/** "Best of UTM 2026 — 24 projects · curated by …" */
export function CollectionCard({ collection }: { collection: CollectionSummary }) {
  const n = collection.projectCount
  const campus = campusShort(collection.owner.campus)
  return (
    <Link to={`/collections/${collection.id}`} className="card collection-card">
      <CoverStack projects={collection.preview} />
      <span className="stack" style={{ gap: 4, minWidth: 0 }}>
        <span className="disp collection-card__title">{collection.title}</span>
        <span className="muted collection-card__meta">
          {n} project{n === 1 ? '' : 's'} · curated by {collection.owner.name}
          {campus && ` · ${campus}`}
        </span>
      </span>
    </Link>
  )
}
