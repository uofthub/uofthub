import type { OrgStatus } from '@uofthub/types'
import type { ChipColor } from '../components/ui'

/** Mirrors VERIFICATION_WINDOW_DAYS in the API's lib/orgs.ts. */
export const VERIFICATION_WINDOW_DAYS = 7

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  PENDING_VERIFICATION: 'Awaiting verification',
  IN_REVIEW: 'In review',
  INFO_REQUESTED: 'More info needed',
  VERIFIED: 'Verified',
}

export const ORG_STATUS_COLORS: Record<OrgStatus, ChipColor> = {
  PENDING_VERIFICATION: 'orange',
  IN_REVIEW: 'blue',
  INFO_REQUESTED: 'yellow',
  VERIFIED: 'green',
}

/**
 * Whole days left on a verification deadline, rounded up so the last partial
 * day still reads as "1 day left" rather than "0". Negative once it's past.
 */
export function daysUntil(deadline?: string): number | null {
  if (!deadline) return null
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${bytes}B`
}
