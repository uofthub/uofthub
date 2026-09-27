import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ReportReason } from '@uofthub/types'
import { api } from '../../lib/api'
import { PROFILE_REPORT_REASONS, REPORT_REASONS } from '../../lib/moderation'
import { Button, Dialog, ErrorText, Field, Select, SuccessText, TextArea } from '../ui'

/** What can be reported, and where each kind goes. */
export type ReportTarget =
  | { kind: 'project'; projectId: string }
  | { kind: 'comment'; projectId: string; commentId: string }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'activity'; slug: string; activityId: string }

const NOUN: Record<ReportTarget['kind'], string> = {
  project: 'project',
  comment: 'comment',
  collection: 'collection',
  user: 'profile',
  activity: 'event',
}

function sendReport(target: ReportTarget, body: { reason: ReportReason; details?: string }) {
  switch (target.kind) {
    case 'project':
      return api.projects.report(target.projectId, body)
    case 'comment':
      return api.projects.reportComment(target.projectId, target.commentId, body)
    case 'collection':
      return api.collections.report(target.collectionId, body)
    case 'user':
      return api.users.report(target.userId, body)
    case 'activity':
      return api.orgs.reportActivity(target.slug, target.activityId, body)
  }
}

export function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const reasons = target.kind === 'user' ? PROFILE_REPORT_REASONS : REPORT_REASONS
  const [reason, setReason] = useState<ReportReason>(reasons[0].value)
  const [details, setDetails] = useState('')
  const send = useMutation({
    mutationFn: () => sendReport(target, { reason, details: details.trim() || undefined }),
  })
  const noun = NOUN[target.kind]

  return (
    <Dialog
      title={`Report this ${noun}`}
      onClose={onClose}
      footer={
        send.isSuccess ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? 'Sending…' : 'Send report'}
            </Button>
          </>
        )
      }
    >
      {send.isSuccess ? (
        <SuccessText>Thanks — a moderator will review this.</SuccessText>
      ) : (
        <>
          <Field label="What is wrong with it?">
            <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {reasons.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Anything else we should know?"
            hint="Optional, but it is what a moderator reads first."
          >
            <TextArea
              rows={4}
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={`Which part of the ${noun}, and why…`}
            />
          </Field>
        </>
      )}
      {send.isError && <ErrorText>{(send.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
