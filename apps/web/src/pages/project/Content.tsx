import type { ProjectSection } from '@uofthub/types'
import type { ProjectDetail } from '../../lib/api'
import { sectionAnchor, sectionLabel, shownSections } from '../../lib/sections'
import Markdown from '../../components/Markdown'
import { Panel } from '../../components/ui'

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
