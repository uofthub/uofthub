import type { ProjectStatus, ProjectType, Visibility } from '@prisma/client'

/**
 * What an edit changed, as the Updates timeline says it.
 *
 * Stored as data rather than sentences so the web app words them (and so the
 * status label it shows is the one it shows everywhere else). The texts that
 * can run long — the story, the sections — are only ever "edited", never
 * quoted: the version itself holds what they said.
 */
export type Change =
  | { kind: 'renamed'; from: string; to: string }
  | {
      kind: 'edited'
      part:
        | 'pitch'
        | 'description'
        | 'sections'
        | 'details'
        | 'tags'
        | 'references'
        | 'outputs'
        | 'helpNeeded'
    }
  | { kind: 'status'; to: ProjectStatus | null }
  | { kind: 'type'; to: ProjectType | null }
  | { kind: 'course'; to: string | null }
  | { kind: 'visibility'; to: Visibility }
  | { kind: 'added' | 'removed'; what: 'file' | 'link'; name: string }
  | { kind: 'restored'; versionNum: number }

type Fields = {
  title: string
  pitch: string | null
  description: string | null
  sections: unknown
  details: unknown
  tags: string[]
  type: ProjectType | null
  status: ProjectStatus | null
  helpNeeded: string | null
  courseCode: string | null
  visibility: Visibility
}

/** JSON-equal: the columns compared here hold plain JSON, in a fixed order. */
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * The changes between a project's row before an edit and after it. The editor
 * sends every field on every save, so this is what tells a real change from
 * a save that touched nothing. References and outputs are compared by the
 * route, which is the only place that has them before and after.
 */
export function fieldChanges(before: Fields, after: Fields): Change[] {
  const out: Change[] = []
  if (before.title !== after.title)
    out.push({ kind: 'renamed', from: before.title, to: after.title })
  if (before.status !== after.status) out.push({ kind: 'status', to: after.status })
  if (before.type !== after.type) out.push({ kind: 'type', to: after.type })
  if (before.courseCode !== after.courseCode) out.push({ kind: 'course', to: after.courseCode })
  if (before.visibility !== after.visibility) out.push({ kind: 'visibility', to: after.visibility })
  const parts = [
    ['pitch', before.pitch, after.pitch],
    ['helpNeeded', before.helpNeeded, after.helpNeeded],
    ['description', before.description, after.description],
    ['sections', before.sections, after.sections],
    ['details', before.details, after.details],
    ['tags', before.tags, after.tags],
  ] as const
  for (const [part, a, b] of parts) if (!same(a, b)) out.push({ kind: 'edited', part })
  return out
}

/** Whether two lists of rows say the same thing, ignoring their ids. */
export const sameRows = same

/** What a change is about, so a later one of the same can replace it. */
function identity(c: Change): string {
  switch (c.kind) {
    case 'renamed':
    case 'status':
    case 'type':
    case 'course':
    case 'visibility':
    case 'restored':
      return c.kind
    case 'edited':
      return `edited:${c.part}`
    case 'added':
    case 'removed':
      return `${c.what}:${c.name}`
  }
}

/**
 * One burst of edits as one list: a later change to the same thing replaces
 * the earlier one, a rename keeps where it started, and something added and
 * removed again (or renamed back) drops out altogether.
 */
export function mergeChanges(earlier: Change[], later: Change[]): Change[] {
  const merged = new Map(earlier.map((c) => [identity(c), c]))
  for (const c of later) {
    const key = identity(c)
    const prior = merged.get(key)
    if (c.kind === 'renamed' && prior?.kind === 'renamed') {
      if (prior.from === c.to) merged.delete(key)
      else merged.set(key, { ...c, from: prior.from })
    } else if (
      (c.kind === 'added' || c.kind === 'removed') &&
      (prior?.kind === 'added' || prior?.kind === 'removed') &&
      prior.kind !== c.kind
    ) {
      merged.delete(key)
    } else {
      // A Map keeps the place of a key it already has: each change stays
      // where it first came up, with what it came to.
      merged.set(key, c)
    }
  }
  return [...merged.values()]
}
