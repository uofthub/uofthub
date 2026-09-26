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
    <div className="grid grid-cols-2 gap-3 min-[1000px]:grid-cols-4 min-[1000px]:gap-4">
      {tiles.map((f) => (
        <Link
          key={f.name}
          to={`/explore?faculty=${encodeURIComponent(f.name)}`}
          className="flex h-28 flex-col justify-between rounded-2xl p-3.5 transition-transform duration-120 hover:-translate-y-0.5 sm:h-33 sm:p-4.5"
          style={{ background: f.bg, color: f.ink }}
        >
          <span className="flex size-10 items-center justify-center rounded-btn bg-white">
            <Icon name={f.icon} size={20} />
          </span>
          <span>
            <span className="block font-display text-16 font-bold text-[#15171c] sm:text-19">
              {f.short}
            </span>
            <span className="text-13 font-semibold">
              {facets ? countLabel(count(f.name)) : 'Browse projects →'}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}
