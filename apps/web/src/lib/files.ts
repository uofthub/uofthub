import type { ChipColor } from '../components/ui'

/**
 * Client-side view of the upload policy in the API's lib/fileValidation.ts.
 * Duplicated rather than shared because it exists for a different reason: the
 * API decides what may be stored and served, this decides which icon to draw
 * and whether to offer a Preview button before spending a request finding out.
 */
export type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text'

const PREVIEW_KINDS: Record<PreviewKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
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
  return (Object.keys(PREVIEW_KINDS) as PreviewKind[]).find(kind => PREVIEW_KINDS[kind].includes(ext))
}

/** Icon and tint per file type, so a list of files reads at a glance. */
const LOOKS: { extensions: string[]; icon: string; color: ChipColor }[] = [
  { extensions: ['pdf'], icon: 'mdi-file-pdf-box', color: 'red' },
  { extensions: ['doc', 'docx', 'txt', 'md'], icon: 'mdi-file-document-outline', color: 'blue' },
  { extensions: ['xls', 'xlsx', 'csv'], icon: 'mdi-file-table-outline', color: 'green' },
  { extensions: ['ppt', 'pptx'], icon: 'mdi-file-presentation-box', color: 'orange' },
  { extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'], icon: 'mdi-file-image-outline', color: 'purple' },
  { extensions: ['mp4', 'webm'], icon: 'mdi-file-video-outline', color: 'pink' },
  { extensions: ['mp3', 'wav'], icon: 'mdi-file-music-outline', color: 'mint' },
  { extensions: ['zip'], icon: 'mdi-folder-zip-outline', color: 'yellow' },
]

export function lookFor(filename: string): { icon: string; color: ChipColor } {
  const ext = extOf(filename)
  const look = LOOKS.find(l => l.extensions.includes(ext))
  return look ? { icon: look.icon, color: look.color } : { icon: 'mdi-file-outline', color: 'grey' }
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
