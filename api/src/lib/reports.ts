import type { ReportReason, ReportStatus } from '@prisma/client'
import { db } from '../db/client.js'
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
  'IMPERSONATION',
  'OTHER',
] as const satisfies readonly ReportReason[]

export const REPORT_DETAILS_MAX = 1000

export const isReportReason = (value: unknown): value is ReportReason =>
  REPORT_REASONS.includes(value as ReportReason)

/** The reporter's free text, trimmed and capped; null when they wrote nothing. */
export const reportDetails = (raw: string | undefined) =>
  (raw ?? '').trim().slice(0, REPORT_DETAILS_MAX) || null

/** How much of reported text a moderator is shown, as it read at the time. */
export const REPORT_EXCERPT_MAX = 2000

export type ReportTargetRef =
  | { targetType: 'PROJECT'; projectId: string }
  | { targetType: 'COMMENT'; projectId: string; commentId: string }
  | { targetType: 'COLLECTION'; collectionId: string }
  | { targetType: 'USER' }
  | { targetType: 'ORG_ACTIVITY'; activityId: string }

/** What decides one report is about the same thing as another. */
function sameTarget(target: ReportTargetRef, subjectUserId: string) {
  switch (target.targetType) {
    case 'PROJECT':
      return { targetType: target.targetType, projectId: target.projectId }
    case 'COMMENT':
      return { targetType: target.targetType, commentId: target.commentId }
    case 'COLLECTION':
      return { targetType: target.targetType, collectionId: target.collectionId }
    case 'ORG_ACTIVITY':
      return { targetType: target.targetType, activityId: target.activityId }
    case 'USER':
      return { targetType: target.targetType, subjectUserId }
  }
}

/**
 * File a report, or say why not: nobody reports their own things, and one
 * open report per person per target is enough — a second adds nothing to the
 * queue. Every route that files a report goes through here.
 */
export async function fileReport(input: {
  reporterId: string
  subjectUserId: string
  target: ReportTargetRef
  reason: ReportReason
  details: string | undefined
  excerpt?: string | null
}): Promise<{ error: string; status: 400 | 409 } | { id: string; status: ReportStatus }> {
  if (input.subjectUserId === input.reporterId)
    return { error: 'You cannot report your own things', status: 400 }
  const existing = await db.report.findFirst({
    where: {
      reporterId: input.reporterId,
      status: 'OPEN',
      ...sameTarget(input.target, input.subjectUserId),
    },
    select: { id: true },
  })
  if (existing) return { error: 'You have already reported this', status: 409 }
  return db.report.create({
    data: {
      reporterId: input.reporterId,
      subjectUserId: input.subjectUserId,
      ...input.target,
      reason: input.reason,
      details: reportDetails(input.details),
      excerpt: input.excerpt?.slice(0, REPORT_EXCERPT_MAX) ?? null,
    },
    select: { id: true, status: true },
  })
}
