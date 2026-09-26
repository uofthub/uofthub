import type { ReportReason } from '@prisma/client'
import { bySession } from './rateLimit.js'

/**
 * What reporting a project and reporting a conversation share: the reasons a
 * reporter can pick, how much they can write, and the budget.
 */

// Every report costs a moderator's attention, so the budget is tight — a
// genuine reporter never needs more than a handful in an hour. Keyed by
// session rather than by IP; see lib/rateLimit.ts for why.
export const reportRateLimit = {
  rateLimit: { max: 5, timeWindow: '1 hour', keyGenerator: bySession },
}

export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'ACADEMIC_INTEGRITY',
  'INTELLECTUAL_PROPERTY',
  'PRIVACY',
  'OTHER',
] as const satisfies readonly ReportReason[]

export const REPORT_DETAILS_MAX = 1000

export const isReportReason = (value: unknown): value is ReportReason =>
  REPORT_REASONS.includes(value as ReportReason)

/** The reporter's free text, trimmed and capped; null when they wrote nothing. */
export const reportDetails = (raw: string | undefined) =>
  (raw ?? '').trim().slice(0, REPORT_DETAILS_MAX) || null
