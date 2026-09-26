import type { ProjectType } from '@uofthub/types'

/**
 * What each type of project suggests in the editor: the details worth
 * recording (a film's runtime, a study's supervisor), the links worth adding
 * as outputs (a live demo, a listening link), and what its files usually are.
 * Suggestions only — nothing here is required, and a suggestion left empty is
 * not saved.
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
