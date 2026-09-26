import { useQuery } from '@tanstack/react-query'
import type { ProjectSection } from '@uofthub/types'
import { api, type ProjectDetail } from '../../lib/api'
import { REFERENCE_KINDS, referenceByline, referenceHref } from '../../lib/references'
import { sectionAnchor, sectionLabel, shownSections } from '../../lib/sections'
import Markdown from '../../components/Markdown'
import { MiniRow } from '../../components/project'
import { cx, Eyebrow, Icon, Panel } from '../../components/ui'

/**
 * What a project says about itself: the overview, then each section it has.
 *
 * Nothing here renders for something left empty — no heading over nothing,
 * no placeholder, no entry in the contents list. A project with only a title
 * shows only a title. The owner fills things in from the editor, not from
 * prompts scattered over their own page.
 */

export function Overview({ project }: { project: ProjectDetail }) {
  const text = project.description?.trim()
  if (!text) return null
  return (
    <Panel title="Overview" size="story" id="overview">
      <Markdown source={text} />
    </Panel>
  )
}

function Items({ section }: { section: ProjectSection }) {
  const items = section.items ?? []
  if (items.length === 0) return null
  // Approaches are compared, so they sit side by side; examples read in order.
  return (
    <div
      className={cx(
        'grid gap-3.5',
        section.kind === 'approaches' && 'grid-cols-[repeat(auto-fit,minmax(220px,1fr))]'
      )}
    >
      {items.map((item, i) => (
        <article
          key={`${item.label}-${i}`}
          className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-line px-4.5 py-4"
        >
          <h3 className="text-16 font-[650]">{item.label}</h3>
          {item.body?.trim() && <Markdown source={item.body} />}
        </article>
      ))}
    </div>
  )
}

export function ProjectSections({ project }: { project: ProjectDetail }) {
  return shownSections(project.sections).map((section) => (
    <Panel
      key={section.id}
      id={sectionAnchor(section)}
      title={sectionLabel(section, project.type)}
      size="story"
    >
      {section.body?.trim() && <Markdown source={section.body} />}
      <Items section={section} />
    </Panel>
  ))
}

/**
 * What the project drew on, each with the other projects that cited the same
 * thing ("also used in…"). Those come from their own request, since they are
 * other people's projects, filtered to the ones this reader can see.
 */
export function References({ project }: { project: ProjectDetail }) {
  const references = project.references ?? []
  const { data: shared = [] } = useQuery({
    queryKey: ['shared-references', project.id],
    queryFn: () => api.projects.sharedReferences(project.id),
    enabled: references.some((r) => r.key),
    staleTime: 5 * 60 * 1000,
  })
  if (references.length === 0) return null
  const alsoUsed = new Map(shared.map((s) => [s.reference.key, s.projects]))
  const listed = new Set<string>()

  return (
    <Panel title="References" size="story" className="gap-4" id="references">
      <ol className="grid gap-4 text-14 leading-normal">
        {references.map((ref) => {
          const kind = REFERENCE_KINDS[ref.kind]
          const href = referenceHref(ref)
          const byline = referenceByline(ref)
          // A thing cited twice gets its "also used in" once.
          const others = ref.key && !listed.has(ref.key) ? alsoUsed.get(ref.key) : undefined
          if (ref.key) listed.add(ref.key)
          return (
            <li key={ref.id} className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-3">
              <span
                className="grid size-8 place-items-center rounded-lg bg-fill text-navy-ink"
                title={kind.label}
              >
                <Icon name={kind.icon} size={16} />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-15 font-semibold wrap-anywhere">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {ref.title}
                    </a>
                  ) : (
                    ref.title
                  )}
                  <span className="text-muted"> · {kind.label}</span>
                </span>
                {byline && <span className="text-muted">{byline}</span>}
                {ref.note && <span>{ref.note}</span>}
                {others && others.length > 0 && (
                  <div className="flex flex-col gap-2 pt-1.5">
                    <Eyebrow as="span">Also used in</Eyebrow>
                    {others.map((p) => (
                      <MiniRow key={p.id} project={p} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

/**
 * Links to the overview and each section, for a project long enough to need
 * them. Built from what actually rendered, so it never lists an empty one.
 */
export function Contents({ project }: { project: ProjectDetail }) {
  const entries = [
    ...(project.description?.trim() ? [{ href: '#overview', label: 'Overview' }] : []),
    ...shownSections(project.sections).map((s) => ({
      href: `#${sectionAnchor(s)}`,
      label: sectionLabel(s, project.type),
    })),
    ...(project.references?.length ? [{ href: '#references', label: 'References' }] : []),
  ]
  if (entries.length < 2) return null
  return (
    <Panel title="Contents" className="px-5.5 py-5">
      <nav aria-label="Contents">
        <ol className="grid list-decimal gap-2 pl-5 text-14">
          {entries.map((e) => (
            <li key={e.href}>
              <a href={e.href} className="text-ink">
                {e.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </Panel>
  )
}
