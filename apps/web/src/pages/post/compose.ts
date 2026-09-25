import type { ProjectType } from '@uofthub/types'

/**
 * The type-specific questions on the post form, and where each answer goes.
 *
 * The type, status and pitch are fields of their own. The type-specific
 * answers land in what else the API stores — a URL becomes a labelled link
 * (which the project page turns into "Try it live" or "View code"), a short
 * answer becomes a labelled detail ("Runtime: 6:12"), and a research abstract
 * becomes the overview — so nothing a student types is dropped.
 */

export type ExtraField = {
  key: string
  label: string
  placeholder: string
  hint?: string
  /** Becomes a project link with this label. */
  link?: string
  /** Becomes a detail with this label. */
  detail?: string
  /** A paragraph of the overview (research abstracts). */
  paragraph?: boolean
  multiline?: boolean
  half?: boolean
}

export type Dropzone = { title: string; hint: string; accept?: string }

export const TYPE_FORMS: Record<ProjectType, { fields: ExtraField[]; drop: Dropzone }> = {
  APP: {
    fields: [
      {
        key: 'live',
        label: 'Live link',
        placeholder: 'https://',
        hint: 'Shown as the “Try it live” button',
        link: 'Live demo',
        half: true,
      },
      {
        key: 'repo',
        label: 'Code repository',
        placeholder: 'https://',
        hint: 'Optional',
        link: 'Code',
        half: true,
      },
    ],
    drop: {
      title: 'Screenshots or a demo GIF',
      hint: 'PNG, JPG, GIF · up to 8',
      accept: 'image/*',
    },
  },
  RESEARCH: {
    fields: [
      {
        key: 'abstract',
        label: 'Abstract',
        placeholder: 'A few sentences a student in another faculty could follow',
        paragraph: true,
        multiline: true,
      },
      {
        key: 'supervisor',
        label: 'Supervisor or lab',
        placeholder: 'e.g. Aquatic Ecology Lab',
        hint: 'Optional, shown with their permission',
        detail: 'Supervisor or lab',
      },
    ],
    drop: {
      title: 'Upload your paper or poster',
      hint: 'PDF · opens right on the project page',
      accept: '.pdf,image/*',
    },
  },
  FILM: {
    fields: [
      {
        key: 'video',
        label: 'Video link',
        placeholder: 'YouTube, Vimeo or Drive',
        link: 'Watch',
        half: true,
      },
      { key: 'runtime', label: 'Runtime', placeholder: 'e.g. 6:12', detail: 'Runtime', half: true },
      {
        key: 'credits',
        label: 'Credits',
        placeholder: 'Director, camera, sound…',
        hint: 'Invite classmates below to credit them on the project',
        detail: 'Credits',
      },
    ],
    drop: {
      title: 'A still or a clip',
      hint: 'JPG, PNG, MP4 or WebM · the first image is the cover',
      accept: 'image/*,video/mp4,video/webm',
    },
  },
  DESIGN: {
    fields: [
      {
        key: 'figma',
        label: 'Figma or prototype link',
        placeholder: 'https://',
        hint: 'Optional',
        link: 'Prototype',
      },
    ],
    drop: {
      title: 'Boards, mockups or photos',
      hint: 'PNG, JPG, PDF · first image is the cover',
      accept: 'image/*,.pdf',
    },
  },
  AUDIO: {
    fields: [
      {
        key: 'listen',
        label: 'Listening link',
        placeholder: 'SoundCloud, Bandcamp or Spotify',
        hint: 'Shown as the “Listen” button',
        link: 'Listen',
      },
      {
        key: 'performers',
        label: 'Performers',
        placeholder: 'Who played on it?',
        detail: 'Performers',
      },
    ],
    drop: { title: 'Tracks', hint: 'MP3 or WAV', accept: 'audio/mpeg,audio/wav,.mp3,.wav' },
  },
  HARDWARE: {
    fields: [
      {
        key: 'guide',
        label: 'Build guide or schematics',
        placeholder: 'https://',
        hint: 'Optional',
        link: 'Build guide',
      },
    ],
    drop: {
      title: 'Photos of the build',
      hint: 'The first photo is the cover',
      accept: 'image/*,video/mp4,video/webm',
    },
  },
  WRITING: {
    fields: [
      {
        key: 'published',
        label: 'Published in',
        placeholder: 'e.g. The Varsity, a course anthology',
        hint: 'Optional',
        detail: 'Published in',
      },
    ],
    drop: {
      title: 'Your piece',
      hint: 'PDF, DOCX or plain text',
      accept: '.pdf,.doc,.docx,.txt,.md',
    },
  },
  OTHER: {
    fields: [
      { key: 'link', label: 'Link', placeholder: 'https://', hint: 'Optional', link: 'Link' },
    ],
    drop: { title: 'Files', hint: 'Anything that shows the work' },
  },
}

/**
 * The overview the API stores from the form: the answers that are paragraphs
 * (a research abstract). The one-line pitch is its own field and is not
 * repeated here.
 */
export function composeDescription(type: ProjectType, answers: Record<string, string>): string {
  return TYPE_FORMS[type].fields
    .flatMap((f) => {
      const value = answers[f.key]?.trim()
      return f.paragraph && value ? [value] : []
    })
    .join('\n\n')
}

/** The details the API stores, from the short free-text answers. */
export function composeDetails(
  type: ProjectType,
  answers: Record<string, string>
): { label: string; value: string }[] {
  return TYPE_FORMS[type].fields.flatMap((f) => {
    const value = answers[f.key]?.trim()
    return f.detail && value ? [{ label: f.detail, value }] : []
  })
}

/** The links the API stores, from the answers that are URLs. */
export function composeLinks(
  type: ProjectType,
  answers: Record<string, string>
): { label: string; url: string }[] {
  return TYPE_FORMS[type].fields.flatMap((f) => {
    const url = answers[f.key]?.trim()
    return f.link && url ? [{ label: f.link, url }] : []
  })
}

/** What a link is most likely to be, from where it lives. Null when it could be anything. */
export function typeForUrl(url: string): ProjectType | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  const on = (...hosts: string[]) => hosts.some((h) => host === h || host.endsWith(`.${h}`))
  if (on('github.com', 'gitlab.com', 'vercel.app', 'netlify.app', 'itch.io')) return 'APP'
  if (on('youtube.com', 'youtu.be', 'vimeo.com')) return 'FILM'
  if (on('figma.com', 'behance.net', 'dribbble.com')) return 'DESIGN'
  if (on('soundcloud.com', 'bandcamp.com', 'spotify.com')) return 'AUDIO'
  if (on('arxiv.org', 'doi.org', 'researchgate.net')) return 'RESEARCH'
  if (on('medium.com', 'substack.com')) return 'WRITING'
  return null
}

/** Imported link labels, and the form field label each one belongs in. */
const LINK_HOMES: Record<string, string[]> = {
  'Live demo': ['Live demo'],
  'Source code': ['Code', 'Build guide', 'Link'],
}

/**
 * Put imported links into the type's link fields: a labelled link where its
 * label fits, anything else into the first field still empty. What does not
 * fit is returned, to be stored as a plain link.
 */
export function placeLinks(
  type: ProjectType,
  links: { label: string; url: string }[]
): { answers: Record<string, string>; rest: { label: string; url: string }[] } {
  const slots = TYPE_FORMS[type].fields.filter((f) => f.link)
  const answers: Record<string, string> = {}
  const rest: { label: string; url: string }[] = []
  for (const link of links) {
    const homes = LINK_HOMES[link.label] ?? []
    const slot =
      slots.find((f) => !answers[f.key] && homes.includes(f.link!)) ??
      (homes.length === 0 ? slots.find((f) => !answers[f.key]) : undefined)
    if (slot) answers[slot.key] = link.url
    else rest.push(link)
  }
  return { answers, rest }
}
