import type { ProjectSection, ProjectType, SectionKind } from '@uofthub/types'

/**
 * What a project's sections are called, and which of them are shown.
 *
 * A section stores its kind, not its heading: the heading comes from the kind
 * and the project's type, so "method" reads "Methodology" on research and
 * "Process" on a film, and changing the type relabels everything. A title the
 * author (or a course template) gave the section always wins.
 */

type Labels = Record<Exclude<SectionKind, 'custom'>, string>

const DEFAULT_LABELS: Labels = {
  motivation: 'Motivation',
  method: 'Method',
  approaches: 'Approaches compared',
  data: 'Data',
  results: 'Results',
  examples: 'Examples',
  considerations: 'Considerations',
  reflection: 'Reflection',
  conclusion: 'Conclusion',
}

const RESEARCH: Partial<Labels> = {
  motivation: 'Research question',
  method: 'Methodology',
  results: 'Findings',
  considerations: 'Limitations & ethics',
}

const MAKING: Partial<Labels> = {
  motivation: 'Brief',
  method: 'Process',
  approaches: 'Directions explored',
  data: 'Sources & materials',
  results: 'Outcome',
  examples: 'Stills & examples',
}

const BUILDING: Partial<Labels> = {
  motivation: 'The problem',
  method: 'How it works',
  considerations: 'Trade-offs',
  reflection: 'What I learned',
}

const AUTHORING: Partial<Labels> = {
  motivation: 'Context',
  method: 'Process',
  approaches: 'Approaches',
  data: 'Sources',
  results: 'Outcome',
  examples: 'Excerpts',
}

const BY_TYPE: Record<ProjectType, Partial<Labels>> = {
  RESEARCH,
  DESIGN: MAKING,
  FILM: MAKING,
  APP: BUILDING,
  HARDWARE: BUILDING,
  WRITING: AUTHORING,
  AUDIO: AUTHORING,
  OTHER: {},
}

/** The default heading for a kind of section on a project of this type. */
export function kindLabel(kind: Exclude<SectionKind, 'custom'>, type?: ProjectType | null) {
  return (type && BY_TYPE[type][kind]) || DEFAULT_LABELS[kind]
}

/** The heading a section is shown under. */
export function sectionLabel(section: ProjectSection, type?: ProjectType | null): string {
  const title = section.title?.trim()
  if (title) return title
  // A custom section is refused without a title; this is only for a row
  // written some other way, and says nothing rather than something wrong.
  if (section.kind === 'custom') return 'More'
  return kindLabel(section.kind, type)
}

const filled = (text?: string) => !!text?.trim()

/**
 * The sections that have something to show, items thinned the same way. The
 * API already strips empty ones before storing; this is the same rule again
 * for rows written any other way, so an empty heading can never render.
 */
export function shownSections(sections: ProjectSection[] | null | undefined): ProjectSection[] {
  return (sections ?? []).flatMap((s) => {
    const items = (s.items ?? []).filter((i) => filled(i.label) || filled(i.body))
    if (!filled(s.body) && items.length === 0) return []
    return [{ ...s, items }]
  })
}

/** The anchor a section is linked to from the page's contents list. */
export const sectionAnchor = (section: Pick<ProjectSection, 'id'>) => `section-${section.id}`
