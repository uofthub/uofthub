import type { Visibility } from '@uofthub/types'
import type { ProjectChange } from './api'
import { PROJECT_STATUSES, PROJECT_TYPES } from './projectMeta'

/**
 * What an edit changed, in the words the Updates timeline and the bell use.
 * The API records the changes as data (api/src/lib/changes.ts); this is the
 * one place they become sentences, so the status and type read as they do on
 * every pill.
 */

const PARTS: Record<Extract<ProjectChange, { kind: 'edited' }>['part'], string> = {
  pitch: 'the pitch',
  description: 'the overview',
  sections: 'the write-up',
  details: 'the details',
  tags: 'the tags',
  references: 'the references',
  outputs: 'what it produced',
  helpNeeded: 'what it needs help with',
}

const VISIBILITIES: Record<Visibility, string> = {
  PUBLIC: 'Made it public',
  UOFT: 'Shared it with U of T',
  UNLISTED: 'Made it link-only',
  PRIVATE: 'Made it a draft again',
}

export function describeChange(c: ProjectChange): string {
  switch (c.kind) {
    case 'renamed':
      return `Renamed it from “${c.from}” to “${c.to}”`
    case 'edited':
      return `Edited ${PARTS[c.part]}`
    case 'status':
      return c.to ? `Marked it ${PROJECT_STATUSES[c.to].label.toLowerCase()}` : 'Cleared its status'
    case 'type':
      return c.to ? `Filed it as ${PROJECT_TYPES[c.to].label.toLowerCase()}` : 'Cleared its type'
    case 'course':
      return c.to ? `Filed it under ${c.to}` : 'Took it out of its course'
    case 'visibility':
      return VISIBILITIES[c.to]
    case 'added':
      return `Added the ${c.what} “${c.name}”`
    case 'removed':
      return `Removed the ${c.what} “${c.name}”`
    case 'restored':
      return `Restored v${c.versionNum}`
  }
}

/**
 * One line for a list of changes: the first two, then how many more. For
 * the bell, where there is room for one line.
 */
export function summarizeChanges(changes: ProjectChange[]): string {
  const said = changes.slice(0, 2).map(describeChange)
  const more = changes.length - said.length
  const first = said.map((s, i) => (i === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)))
  return first.join(', ') + (more > 0 ? ` and ${more} more` : '')
}
