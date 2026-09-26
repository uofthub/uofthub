import type { ProjectStatus, ProjectType } from '@uofthub/types'
import type { IconName } from '../components/ui/Icon'

/**
 * The design's vocabulary for a project: what kind of work it is and where it
 * stands. See the Card system board — "each type decides the preview, the main
 * action button and which fields the post form asks for". Keyed by the API's
 * own values, so a project's `type` and `status` index straight into these.
 */

export type { ProjectStatus, ProjectType }

export type TypeMeta = {
  /** The uppercase badge on a card. */
  badge: string
  /** The label in the post form's picker. */
  label: string
  /** The plural for a filter chip — "Apps", "Films". */
  plural: string
  hint: string
  icon: IconName
  bg: string
  ink: string
}

export const PROJECT_TYPES: Record<ProjectType, TypeMeta> = {
  APP: {
    badge: 'App',
    label: 'App or website',
    plural: 'Apps',
    hint: 'Live link, code',
    icon: 'window',
    bg: '#E6EBF4',
    ink: '#1E3765',
  },
  RESEARCH: {
    badge: 'Research',
    label: 'Research',
    plural: 'Research',
    hint: 'Paper, poster, data',
    icon: 'file',
    bg: '#E3EEE6',
    ink: '#1F5B34',
  },
  FILM: {
    badge: 'Film',
    label: 'Film or video',
    plural: 'Film',
    hint: 'Short, doc, reel',
    icon: 'video',
    bg: '#F6E7E1',
    ink: '#8A3B12',
  },
  DESIGN: {
    badge: 'Design',
    label: 'Design',
    plural: 'Design',
    hint: 'UI, print, spaces',
    icon: 'palette',
    bg: '#F3E8F4',
    ink: '#6B2A70',
  },
  AUDIO: {
    badge: 'Music',
    label: 'Music or audio',
    plural: 'Music',
    hint: 'Tracks, podcast',
    icon: 'music',
    bg: '#FBEFD0',
    ink: '#6B4B00',
  },
  HARDWARE: {
    badge: 'Hardware',
    label: 'Hardware',
    plural: 'Hardware',
    hint: 'Builds, robots',
    icon: 'chip',
    bg: '#E4EAEC',
    ink: '#2F4650',
  },
  WRITING: {
    badge: 'Writing',
    label: 'Writing',
    plural: 'Writing',
    hint: 'Essays, stories',
    icon: 'pen',
    bg: '#EFEDE6',
    ink: '#4A4538',
  },
  OTHER: {
    badge: 'Other',
    label: 'Something else',
    plural: 'Other',
    hint: 'Anything goes',
    icon: 'more',
    bg: '#EFEDE6',
    ink: '#4A4538',
  },
}

export const PROJECT_TYPE_KEYS = Object.keys(PROJECT_TYPES) as ProjectType[]

export const PROJECT_STATUSES: Record<ProjectStatus, { label: string; dot: string }> = {
  IN_PROGRESS: { label: 'In progress', dot: '#C07A00' },
  // Finished rather than "Shipped": a thesis or a film is finished, not shipped.
  SHIPPED: { label: 'Finished', dot: '#2E8B57' },
  HELP_WANTED: { label: 'Looking for help', dot: '#1E3765' },
}

export const PROJECT_STATUS_KEYS = Object.keys(PROJECT_STATUSES) as ProjectStatus[]
