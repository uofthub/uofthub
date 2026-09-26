import type { OutputKind, ProjectOutput } from '@uofthub/types'
import type { IconName } from '../components/ui/Icon'
import { safeUrl, type ProjectDetail, type ProjectSummary } from './api'
import { linkRole, primaryAction, safeLinks } from './projectView'

/**
 * What a project produced, as the page names it: the kind's label, its icon,
 * and the verb on the button that opens it ("View poster", "Watch").
 */
export const OUTPUT_KINDS: Record<OutputKind, { label: string; icon: IconName; action: string }> = {
  POSTER: { label: 'Poster', icon: 'image', action: 'View poster' },
  SLIDES: { label: 'Slides', icon: 'layers', action: 'View slides' },
  PAPER: { label: 'Paper', icon: 'file', action: 'Read paper' },
  VIDEO: { label: 'Video', icon: 'video', action: 'Watch' },
  AUDIO: { label: 'Audio', icon: 'music', action: 'Listen' },
  DEMO: { label: 'Demo', icon: 'globe', action: 'Try it' },
  CODE: { label: 'Code', icon: 'code', action: 'View code' },
  DATASET: { label: 'Dataset', icon: 'layers', action: 'Get the data' },
  OTHER: { label: 'Output', icon: 'link', action: 'Open' },
}

export const OUTPUT_KIND_KEYS = Object.keys(OUTPUT_KINDS) as OutputKind[]

/** What an output is called on the page: its own label, else its kind's. */
export const outputLabel = (o: Pick<ProjectOutput, 'kind' | 'label'>) =>
  o.label?.trim() || OUTPUT_KINDS[o.kind].label

/** A sensible kind for a picked or uploaded file, for the author to change. */
export function outputKindForFile(name: string): OutputKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'SLIDES'
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'VIDEO'
  if (['mp3', 'wav'].includes(ext)) return 'AUDIO'
  if (['csv', 'xls', 'xlsx', 'zip'].includes(ext)) return 'DATASET'
  if (['pdf', 'doc', 'docx'].includes(ext)) return 'PAPER'
  return 'OTHER'
}

/** A sensible kind for a link, from where it points. */
export function outputKindForLink(link: { label: string; url: string }): OutputKind {
  switch (linkRole(link)) {
    case 'code':
      return 'CODE'
    case 'video':
      return 'VIDEO'
    case 'audio':
      return 'AUDIO'
    case 'live':
      return 'DEMO'
    default:
      return 'OTHER'
  }
}

export type ResolvedOutput = ProjectOutput & {
  /** Set for a file output. */
  file?: ProjectDetail['files'][number]
  /** Set for a link output. */
  link?: ProjectDetail['links'][number]
}

/**
 * A project's outputs joined to their files and links, in order. One whose
 * target is not in the project (a stale page) is left out, never shown broken.
 */
export function resolveOutputs(
  project: Pick<ProjectDetail, 'outputs' | 'files' | 'links'>
): ResolvedOutput[] {
  const files = new Map(project.files.map((f) => [f.id, f]))
  const links = new Map(project.links.map((l) => [l.id, l]))
  return (project.outputs ?? []).flatMap((o) => {
    const file = o.fileId ? files.get(o.fileId) : undefined
    const link = o.linkId ? links.get(o.linkId) : undefined
    return file || link ? [{ ...o, file, link }] : []
  })
}

/** The one the project leads with. */
export const primaryOutput = (outputs: ResolvedOutput[]) => outputs.find((o) => o.primary)

/** A card's main button: a link out, or a page in the app. */
export type CardAction = { label: string; icon: IconName } & (
  { href: string; to?: never } | { to: string; href?: never }
)

/**
 * The main button for a project in a list. Its lead output decides it when it
 * has one — "View poster" opens the poster in the project page's viewer, a
 * video link is watched where it lives — and otherwise it is read off the
 * links, as before outputs existed.
 */
export function cardAction(
  project: Pick<ProjectSummary, 'id' | 'links' | 'lead'>
): CardAction | undefined {
  const lead = project.lead
  if (lead) {
    const { action: label, icon } = OUTPUT_KINDS[lead.kind]
    const link = lead.linkId ? project.links.find((l) => l.id === lead.linkId) : undefined
    const href = link && safeUrl(link.url)
    if (href) return { label, icon, href }
    if (lead.fileId) return { label, icon, to: `/projects/${project.id}?view=${lead.fileId}` }
  }
  const fromLinks = primaryAction(safeLinks(project.links))
  return fromLinks && { label: fromLinks.label, icon: fromLinks.icon, href: fromLinks.href }
}

/** A card action as Button props: its icon, and where it goes. */
export const actionTarget = ({ label: _label, ...target }: CardAction) => target
