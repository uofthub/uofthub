import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CollectionSummary } from '../../lib/api'
import { campusShort } from '../../lib/campus'
import { Cover } from '../project/Cover'
import { Card, cx, Icon } from '../ui'

const stack = 'relative block w-70 max-w-full shrink-0'

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
      <span
        className={cx(
          stack,
          'flex h-34.5 items-center justify-center rounded-xl border border-dashed border-line-dashed text-muted'
        )}
        aria-hidden="true"
      >
        <Icon name="layers" size={28} />
      </span>
    )
  return (
    <span className={stack} aria-hidden="true" style={{ height: height + 26 }}>
      {projects.slice(0, 3).map((p, i) => (
        <span
          key={p.id}
          className="absolute w-50 overflow-hidden rounded-btn border-2 border-surface shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
          style={{ left: i * 34, top: i * 10 }}
        >
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
    <Card
      as={Link}
      to={`/collections/${collection.id}`}
      className="flex flex-col gap-3.5 p-4.5 text-ink transition-colors duration-150 hover:border-line-strong hover:text-ink"
    >
      <CoverStack projects={collection.preview} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-20 font-bold tracking-tight">{collection.title}</span>
        <span className="text-14 text-muted">
          {n} project{n === 1 ? '' : 's'} · curated by {collection.owner.name}
          {campus && ` · ${campus}`}
        </span>
      </span>
    </Card>
  )
}

/** Collection cards, as many across as fit at 300px or more. */
export function CollectionGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">{children}</div>
  )
}
