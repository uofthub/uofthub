import type { IconName } from '../components/ui/Icon'

/**
 * Client-side view of the upload policy in the API's lib/fileValidation.ts.
 * Duplicated rather than shared because it exists for a different reason: the
 * API decides what may be stored and served, this decides which icon to draw
 * and whether to offer a Preview button before spending a request finding out.
 */
export type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text'

// SVG is download-only, as the API serves it: it can carry script.
const PREVIEW_KINDS: Record<PreviewKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  pdf: ['pdf'],
  video: ['mp4', 'webm'],
  audio: ['mp3', 'wav'],
  text: ['txt', 'md', 'csv'],
}

export function extOf(filename: string): string {
  return (filename.split('.').pop() ?? '').toLowerCase()
}

export function previewKindFor(filename: string): PreviewKind | undefined {
  const ext = extOf(filename)
  return (Object.keys(PREVIEW_KINDS) as PreviewKind[]).find((kind) =>
    PREVIEW_KINDS[kind].includes(ext)
  )
}

/** Icon and tint per file type, so a list of files reads at a glance. */
const LOOKS: { extensions: string[]; look: FileLook }[] = [
  {
    extensions: ['pdf', 'doc', 'docx', 'txt', 'md'],
    look: { icon: 'file', bg: '#E3EEE6', ink: '#1F5B34' },
  },
  { extensions: ['xls', 'xlsx', 'csv'], look: { icon: 'grid', bg: '#E4EAEC', ink: '#2F4650' } },
  { extensions: ['ppt', 'pptx'], look: { icon: 'layers', bg: '#FBEFD0', ink: '#6B4B00' } },
  {
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
    look: { icon: 'image', bg: '#F3E8F4', ink: '#6B2A70' },
  },
  { extensions: ['mp4', 'webm'], look: { icon: 'video', bg: '#F6E7E1', ink: '#8A3B12' } },
  { extensions: ['mp3', 'wav'], look: { icon: 'music', bg: '#FBEFD0', ink: '#6B4B00' } },
  { extensions: ['zip'], look: { icon: 'download', bg: '#EFEDE6', ink: '#4A4538' } },
]

export type FileLook = { icon: IconName; bg: string; ink: string }

const FALLBACK_LOOK: FileLook = { icon: 'file', bg: '#EFEDE6', ink: '#4A4538' }

export function lookFor(filename: string): FileLook {
  const ext = extOf(filename)
  return LOOKS.find((l) => l.extensions.includes(ext))?.look ?? FALLBACK_LOOK
}

/** Sizes as a person would write them — "480 KB", not "0.5MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
