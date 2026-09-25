import { useQuery } from '@tanstack/react-query'
import type { ProjectSection } from '@uofthub/types'
import { api, type ProjectDetail } from '../../lib/api'
import { REFERENCE_KINDS, referenceByline, referenceHref } from '../../lib/references'
import { sectionAnchor, sectionLabel, shownSections } from '../../lib/sections'
import Markdown from '../../components/Markdown'
import { MiniRow } from '../../components/project'
import { Icon, Panel } from '../../components/ui'

/**
 * What a project says about itself: the overview, then each section it has.
 *
 * Nothing here renders for something left empty — no heading over nothing,
 * no placeholder, no entry in the contents list. A project with only a title
 * shows only a title. The owner fills things in from the editor, not from
 * prompts scattered over their own page.
 */

const PANEL_STYLE = { padding: '30px 34px' }

export function Overview({ project }: { project: ProjectDetail }) {
  const text = project.description?.trim()
  if (!text) return null
  return (
    <Panel title="Overview" size="main" gap={18} style={PANEL_STYLE} id="overview">
      <Markdown source={text} />
    </Panel>
  )
}

function Items({ section }: { section: ProjectSection }) {
  const items = section.items ?? []
  if (items.length === 0) return null
  // Approaches are compared, so they sit side by side; examples read in order.
  return (
    <div className={section.kind === 'approaches' ? 'section-items section-items--grid' : 'section-items'}>
      {items.map((item, i) => (
        <article key={`${item.label}-${i}`} className="section-item">
          <h3 className="section-item__label">{item.label}</h3>
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
      size="main"
      gap={18}
      style={PANEL_STYLE}
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
    <Panel title="References" size="main" gap={16} style={PANEL_STYLE} id="references">
      <ol className="references">
        {references.map((ref) => {
          const kind = REFERENCE_KINDS[ref.kind]
          const href = referenceHref(ref)
          const byline = referenceByline(ref)
          // A thing cited twice gets its "also used in" once.
          const others = ref.key && !listed.has(ref.key) ? alsoUsed.get(ref.key) : undefined
          if (ref.key) listed.add(ref.key)
          return (
            <li key={ref.id} className="reference">
              <span className="reference__icon" title={kind.label}>
                <Icon name={kind.icon} size={16} />
              </span>
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <span className="reference__title">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {ref.title}
                    </a>
                  ) : (
                    ref.title
                  )}
                  <span className="muted"> · {kind.label}</span>
                </span>
                {byline && <span className="muted">{byline}</span>}
                {ref.note && <span>{ref.note}</span>}
                {others && others.length > 0 && (
                  <div className="stack" style={{ gap: 8, paddingTop: 6 }}>
                    <span className="lbl">Also used in</span>
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
    <Panel title="Contents" style={{ padding: '20px 22px' }}>
      <nav aria-label="Contents">
        <ol className="contents">
          {entries.map((e) => (
            <li key={e.href}>
              <a href={e.href}>{e.label}</a>
            </li>
          ))}
        </ol>
      </nav>
    </Panel>
  )
}
