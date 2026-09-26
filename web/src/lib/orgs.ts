import type { OrgStatus } from '@uofthub/types'

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  PENDING_VERIFICATION: 'Awaiting approval',
  IN_REVIEW: 'In review',
  INFO_REQUESTED: 'Awaiting approval',
  VERIFIED: 'Verified',
}

/** The dot on a group's status pill — same scale as a project's status. */
export const ORG_STATUS_DOTS: Record<OrgStatus, string> = {
  PENDING_VERIFICATION: '#C07A00',
  IN_REVIEW: '#1E3765',
  INFO_REQUESTED: '#C07A00',
  VERIFIED: '#2E8B57',
}
