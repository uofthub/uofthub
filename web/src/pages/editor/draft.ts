import type {
  OutputKind,
  ProjectStatus,
  ProjectType,
  ReferenceKind,
  SectionKind,
  Visibility,
} from '@uofthub/types'
import type { CourseTemplate, OutputInput, ProjectDetail, ProjectFields } from '../../lib/api'
import { TYPE_FORMS } from './compose'

/**
 * The editor's working copy of a project, and the pure steps between it and
 * the API: starting one from a project or from nothing, applying a course
 * template, and turning it back into what the API is sent.
 *
 * Kept free of React and of the network so that every rule here — what a
 * template fills and what it leaves alone, what an unfilled template leaves
 * behind (nothing), which file an output points at — is tested directly.
 */

let seq = 0
/** A local id: for React keys, and for sections, the id the API keeps. */
export const newId = (prefix = 'e') =>
  `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Move one entry of a list up or down; a move past either end does nothing. */
export function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

export type DraftItem = {
  key: string
  label: string
  body: string
  /** Guidance from a template, shown as a placeholder. Never saved. */
  prompt?: string
  /**
   * Put there by a template rather than typed. A seeded item left without a
   * body is dropped on save — otherwise its label alone ("Human baseline")
   * would be stored and rendered as a heading over nothing.
   */
  seeded?: boolean
}

export type DraftSection = {
  id: string
  kind: SectionKind
  title: string
  body: string
  items: DraftItem[]
  prompt?: string
}

export type DraftDetail = { key: string; label: string; value: string; placeholder?: string }

export type DraftReference = {
  key: string
  kind: ReferenceKind
  title: string
  url: string
  doi: string
  authors: string
  year: string
  note: string
}

/** Where an output points: something the project has, or something new. */
export type OutputTarget =
  | { type: 'file'; fileId: string; name: string }
  | { type: 'newFile'; file: File }
  | { type: 'link'; linkId: string; label: string; url: string }
  | { type: 'newLink'; label: string; url: string }

export type DraftOutput = {
  key: string
  /** Set for an output the API already has; keeps its thumbnail. */
  id?: string
  kind: OutputKind
  label: string
  primary: boolean
  target: OutputTarget
  /** What the page shows now: the saved thumbnail, or a picked one's preview. */
  thumbnailUrl?: string
  /** A thumbnail waiting to be uploaded, or `'remove'` to clear the saved one. */
  thumbnail?: Blob | 'remove'
}

/**
 * Something already on the project, named for the author if deleting it
 * fails, with the outputs made of it so that keeping it brings them back.
 */
export type Removed = { id: string; name: string; outputs?: DraftOutput[] }

export type Draft = {
  title: string
  pitch: string
  description: string
  type: ProjectType | null
  status: ProjectStatus | null
  /** What it needs help with; sent only while the status asks for help. */
  helpNeeded: string
  courseCode: string
  tags: string[]
  visibility: Visibility
  /** A calendar day, `YYYY-MM-DD`, or empty for none. */
  showFrom: string
  sections: DraftSection[]
  details: DraftDetail[]
  references: DraftReference[]
  outputs: DraftOutput[]
  /** Images and other files that are not outputs: a gallery's screenshots. */
  newFiles: File[]
  /** Files and links already on the project, to delete when it is saved. */
  removedFiles: Removed[]
  removedLinks: Removed[]
  invites: { email: string; role: string }[]
  template: { code: string; version: number } | null
  /** What a template suggested for the primary output and references. */
  hints: { output?: CourseTemplate['primaryOutput']; references?: CourseTemplate['references'] }
}

export function emptyDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    title: '',
    pitch: '',
    description: '',
    type: null,
    status: 'IN_PROGRESS',
    helpNeeded: '',
    courseCode: '',
    tags: [],
    visibility: 'UOFT',
    showFrom: '',
    sections: [],
    details: [],
    references: [],
    outputs: [],
    newFiles: [],
    removedFiles: [],
    removedLinks: [],
    invites: [],
    template: null,
    hints: {},
    ...overrides,
  }
}

/** A saved show-from instant as the day it falls on in Toronto. */
export function torontoDay(iso: string | null | undefined): string {
  if (!iso) return ''
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** The editor's copy of a saved project. */
export function draftFromProject(project: ProjectDetail): Draft {
  const files = new Map(project.files.map((f) => [f.id, f]))
  const links = new Map(project.links.map((l) => [l.id, l]))
  return emptyDraft({
    title: project.title,
    pitch: project.pitch ?? '',
    description: project.description ?? '',
    type: project.type ?? null,
    status: project.status ?? null,
    helpNeeded: project.helpNeeded ?? '',
    courseCode: project.courseCode ?? '',
    tags: project.tags,
    visibility: project.visibility,
    showFrom: torontoDay(project.showFrom),
    sections: (project.sections ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title ?? '',
      body: s.body ?? '',
      items: (s.items ?? []).map((i) => ({ key: newId('i'), label: i.label, body: i.body ?? '' })),
    })),
    details: (project.details ?? []).map((d) => ({ key: newId('d'), ...d })),
    references: (project.references ?? []).map((r) => ({
      key: r.id,
      kind: r.kind,
      title: r.title,
      url: r.url ?? '',
      doi: r.doi ?? '',
      authors: r.authors ?? '',
      year: r.year ? String(r.year) : '',
      note: r.note ?? '',
    })),
    outputs: (project.outputs ?? []).flatMap((o): DraftOutput[] => {
      const file = o.fileId ? files.get(o.fileId) : undefined
      const link = o.linkId ? links.get(o.linkId) : undefined
      const target: OutputTarget | null = file
        ? { type: 'file', fileId: file.id, name: file.name }
        : link
          ? { type: 'link', linkId: link.id, label: link.label, url: link.url }
          : null
      if (!target) return []
      return [
        {
          key: o.id,
          id: o.id,
          kind: o.kind,
          label: o.label ?? '',
          primary: o.primary,
          target,
          thumbnailUrl: o.thumbnailUrl,
        },
      ]
    }),
  })
}

/**
 * Mark a file or link already on the project for deletion on save. An output
 * made of it goes with it now, as it will on the API, so the outputs list
 * never shows something that is about to disappear.
 */
export function removeExisting(draft: Draft, what: 'file' | 'link', item: Removed): Draft {
  const uses = (o: DraftOutput) =>
    what === 'file'
      ? o.target.type === 'file' && o.target.fileId === item.id
      : o.target.type === 'link' && o.target.linkId === item.id
  const removed = { ...item, outputs: draft.outputs.filter(uses) }
  return {
    ...draft,
    ...(what === 'file'
      ? { removedFiles: [...draft.removedFiles, removed] }
      : { removedLinks: [...draft.removedLinks, removed] }),
    outputs: draft.outputs.filter((o) => !uses(o)),
  }
}

/**
 * Keep everything marked for deletion after all, outputs included — at the
 * end of the list, and leading only if nothing else has taken the lead since.
 */
export function keepRemoved(draft: Draft): Draft {
  let hasPrimary = draft.outputs.some((o) => o.primary)
  const back = [...draft.removedFiles, ...draft.removedLinks]
    .flatMap((r) => r.outputs ?? [])
    .map((o) => {
      const primary = o.primary && !hasPrimary
      if (primary) hasPrimary = true
      return { ...o, primary }
    })
  return { ...draft, removedFiles: [], removedLinks: [], outputs: [...draft.outputs, ...back] }
}

/** The detail rows a type suggests, as empty rows with its labels. */
export function suggestedDetails(type: ProjectType): DraftDetail[] {
  return TYPE_FORMS[type].fields.flatMap((f) =>
    f.detail ? [{ key: newId('d'), label: f.detail, value: '', placeholder: f.placeholder }] : []
  )
}

/** The most detail rows a project has — the API's limit. */
const DETAILS_MAX = 12

/**
 * Details from a link import, laid over the rows already there: an empty row
 * with the same label is filled, anything else is added. A value the student
 * wrote is never replaced.
 */
export function mergeImportedDetails(
  details: DraftDetail[],
  imported: { label: string; value: string }[]
): DraftDetail[] {
  const merged = details.map((d) => ({ ...d }))
  for (const { label, value } of imported) {
    const same = merged.find((d) => d.label.trim().toLowerCase() === label.trim().toLowerCase())
    if (same) {
      if (!same.value.trim()) same.value = value
    } else if (merged.length < DETAILS_MAX) {
      merged.push({ key: newId('d'), label, value })
    }
  }
  return merged
}

/**
 * Pre-fill a draft from a course template. It only ever fills what is still
 * empty and adds what is missing — it never overwrites a word the student
 * wrote, and never makes anything required. Whatever is left unfilled is
 * stripped on save like any other empty section.
 */
export function applyTemplate(draft: Draft, template: CourseTemplate): Draft {
  const have = new Set(draft.sections.map((s) => s.kind))
  const added: DraftSection[] = template.sections
    .filter((s) => s.kind === 'custom' || !have.has(s.kind))
    .map((s) => ({
      id: newId('s'),
      kind: s.kind,
      title: s.title ?? '',
      body: '',
      prompt: s.prompt,
      items: (s.items ?? []).map((i) => ({
        key: newId('i'),
        label: i.label,
        body: '',
        prompt: i.prompt,
        seeded: true,
      })),
    }))
  return {
    ...draft,
    type: draft.type ?? template.type,
    courseCode: draft.courseCode.trim() || template.code,
    sections: [...draft.sections, ...added],
    template: { code: template.code, version: template.version },
    hints: { output: template.primaryOutput, references: template.references },
  }
}

/* ---------------------------------- saving --------------------------------- */

/** Text fields: blank means none. */
const orNull = (s: string) => s.trim() || null

export function sectionsPayload(sections: DraftSection[]): ProjectFields['sections'] {
  return sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    ...(s.title.trim() && { title: s.title.trim() }),
    ...(s.body.trim() && { body: s.body }),
    items: s.items
      .filter((i) => !(i.seeded && !i.body.trim()))
      .map((i) => ({ label: i.label, ...(i.body.trim() && { body: i.body }) })),
  }))
}

export function referencesPayload(references: DraftReference[]): ProjectFields['references'] {
  return references.map((r) => ({
    kind: r.kind,
    title: r.title,
    url: orNull(r.url),
    doi: orNull(r.doi),
    authors: orNull(r.authors),
    year: /^\d{4}$/.test(r.year.trim()) ? Number(r.year.trim()) : null,
    note: orNull(r.note),
  }))
}

/**
 * The outputs as the API takes them, once every new file has an id. A new
 * file whose upload failed has none, and is left out rather than failing the
 * whole save; the caller reports it.
 */
export function outputsPayload(
  outputs: DraftOutput[],
  uploaded: Map<File, string>
): OutputInput[] {
  return outputs.flatMap((o): OutputInput[] => {
    const base = { ...(o.id && { id: o.id }), kind: o.kind, label: orNull(o.label), primary: o.primary }
    switch (o.target.type) {
      case 'file':
        return [{ ...base, fileId: o.target.fileId }]
      case 'newFile': {
        const fileId = uploaded.get(o.target.file)
        return fileId ? [{ ...base, fileId }] : []
      }
      case 'link':
        return [{ ...base, linkId: o.target.linkId }]
      case 'newLink':
        return [{ ...base, link: { label: o.target.label, url: o.target.url } }]
    }
  })
}

/**
 * Everything but visibility and the show-from date, which are written last
 * and on their own (see save.ts) so that nothing becomes visible half-saved.
 */
export function contentPayload(draft: Draft): Omit<
  Partial<ProjectFields>,
  'visibility' | 'showFrom' | 'outputs'
> & { title: string } {
  return {
    title: draft.title.trim(),
    pitch: orNull(draft.pitch),
    description: draft.description,
    type: draft.type,
    status: draft.status,
    // Kept while the status moves on, so asking again starts from it.
    ...(draft.status === 'HELP_WANTED' && { helpNeeded: orNull(draft.helpNeeded) }),
    courseCode: orNull(draft.courseCode),
    tags: draft.tags.filter((t) => t.toUpperCase() !== draft.courseCode.trim().toUpperCase()),
    sections: sectionsPayload(draft.sections),
    details: draft.details.map(({ label, value }) => ({ label, value })),
    references: referencesPayload(draft.references),
    ...(draft.template && {
      templateCode: draft.template.code,
      templateVersion: draft.template.version,
    }),
  }
}

/**
 * The draft after a save that partly went through: what was uploaded is now
 * the project's own file, saved outputs carry their ids, and thumbnails,
 * deletions and invitations that went through are not done again. Saving once more retries only
 * what failed.
 */
export function settle(
  draft: Draft,
  result: {
    uploaded: Map<File, string>
    outputIds: Map<string, string>
    thumbnailsDone: Set<string>
    invited: Set<string>
    /** Ids of the files and links that were deleted. */
    removed: Set<string>
  }
): Draft {
  return {
    ...draft,
    outputs: draft.outputs.map((o) => {
      const fileId = o.target.type === 'newFile' ? result.uploaded.get(o.target.file) : undefined
      const target: OutputTarget =
        fileId && o.target.type === 'newFile'
          ? { type: 'file', fileId, name: o.target.file.name }
          : o.target
      const id = result.outputIds.get(o.key) ?? o.id
      return {
        ...o,
        ...(id && { id }),
        target,
        ...(result.thumbnailsDone.has(o.key) && { thumbnail: undefined }),
      }
    }),
    newFiles: draft.newFiles.filter((f) => !result.uploaded.has(f)),
    removedFiles: draft.removedFiles.filter((f) => !result.removed.has(f.id)),
    removedLinks: draft.removedLinks.filter((l) => !result.removed.has(l.id)),
    invites: draft.invites.filter((i) => !result.invited.has(i.email)),
  }
}
