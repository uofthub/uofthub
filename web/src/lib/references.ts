import type { ProjectReference, ReferenceKind } from '@uofthub/types'
import type { IconName } from '../components/ui/Icon'
import { safeUrl } from './api'

/** How each kind of reference is named and marked. */
export const REFERENCE_KINDS: Record<ReferenceKind, { label: string; icon: IconName }> = {
  DATASET: { label: 'Dataset', icon: 'layers' },
  PAPER: { label: 'Paper', icon: 'file' },
  SOFTWARE: { label: 'Software', icon: 'code' },
  MODEL: { label: 'Model', icon: 'chip' },
  BOOK: { label: 'Book', icon: 'bookmark' },
  ARCHIVE: { label: 'Archive', icon: 'inbox' },
  WEBSITE: { label: 'Website', icon: 'globe' },
  OTHER: { label: 'Other', icon: 'link' },
}

export const REFERENCE_KIND_KEYS = Object.keys(REFERENCE_KINDS) as ReferenceKind[]

/**
 * Where a reference's title links: its own URL, else its DOI's resolver.
 * Undefined when neither is safe to put in an href.
 */
export function referenceHref(ref: Pick<ProjectReference, 'url' | 'doi'>): string | undefined {
  if (ref.url) return safeUrl(ref.url)
  if (ref.doi) return `https://doi.org/${encodeURI(ref.doi)}`
  return undefined
}

/** "Vaswani et al. · 2017" — whichever of the two it has. */
export const referenceByline = (ref: Pick<ProjectReference, 'authors' | 'year'>) =>
  [ref.authors?.trim(), ref.year ? String(ref.year) : ''].filter(Boolean).join(' · ')
