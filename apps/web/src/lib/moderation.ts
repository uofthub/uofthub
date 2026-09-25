import type { ReportReason, ReportStatus } from '@uofthub/types'

/**
 * The reasons a project can be reported for, in the order the report dialog
 * offers them: the ones specific to student work first, the generic ones last.
 * `label` is what the reporter picks from; `short` is what the moderation
 * queue shows on a chip.
 */
export const REPORT_REASONS: { value: ReportReason; label: string; short: string }[] = [
  {
    value: 'ACADEMIC_INTEGRITY',
    label: 'Academic integrity — plagiarised work, or solutions to live coursework',
    short: 'Academic integrity',
  },
  {
    value: 'INTELLECTUAL_PROPERTY',
    label: 'Intellectual property — my work, or my group’s, published without consent',
    short: 'IP',
  },
  {
    value: 'PRIVACY',
    label: 'Privacy — personal information about someone who did not consent',
    short: 'Privacy',
  },
  { value: 'HARASSMENT', label: 'Harassment or hateful content', short: 'Harassment' },
  { value: 'SPAM', label: 'Spam or advertising', short: 'Spam' },
  { value: 'OTHER', label: 'Something else', short: 'Other' },
]

/**
 * What a conversation can be reported for — the reasons that make sense for
 * messages, in the order the dialog offers them. Shares the enum, so the
 * moderation queue labels both kinds of report the same way.
 */
export const MESSAGE_REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'HARASSMENT', label: 'Harassment, threats or hateful messages' },
  { value: 'SPAM', label: 'Spam, scams or advertising' },
  { value: 'PRIVACY', label: 'Sharing someone’s personal information' },
  { value: 'OTHER', label: 'Something else' },
]

export const reasonShort = (reason: ReportReason) =>
  REPORT_REASONS.find(r => r.value === reason)?.short ?? reason

export const STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: 'Open',
  DISMISSED: 'Dismissed',
  WARNED: 'Owner warned',
  TAKEN_DOWN: 'Taken down',
}
