import { Link } from 'react-router-dom'
import { FACULTIES } from '../../lib/faculties'
import { countLabel, useFacets } from '../../lib/queries'
import { Icon } from '../../components/ui'

/**
 * The tinted faculty tiles — the eight faculties with the most projects, each
 * with its count, from /projects/facets. Before any counts arrive (or on a
 * brand new site) they fall back to the list's own order.
 */
export function FacultyTiles({ limit = 8 }: { limit?: number }) {
  const { data: facets } = useFacets()
  const count = (name: string) => facets?.faculties[name] ?? 0
  const tiles = [...FACULTIES]
    .sort((a, b) => count(b.name) - count(a.name) || FACULTIES.indexOf(a) - FACULTIES.indexOf(b))
    .slice(0, limit)

  return (
    <div className="faculty-grid">
      {tiles.map((f) => (
        <Link
          key={f.name}
          to={`/explore?faculty=${encodeURIComponent(f.name)}`}
          className="faculty-tile"
          style={{ background: f.bg, color: f.ink }}
        >
          <span className="faculty-tile__icon">
            <Icon name={f.icon} size={20} />
          </span>
          <span>
            <span className="disp faculty-tile__name">{f.short}</span>
            <span className="faculty-tile__sub">
              {facets ? countLabel(count(f.name)) : 'Browse projects →'}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}
