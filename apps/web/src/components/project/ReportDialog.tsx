import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ReportReason } from '@uofthub/types'
import { api } from '../../lib/api'
import { REPORT_REASONS } from '../../lib/moderation'
import { Button, Dialog, ErrorText, Field, Icon, Select, TextArea } from '../ui'

export function ReportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0].value)
  const [details, setDetails] = useState('')
  const send = useMutation({
    mutationFn: () =>
      api.projects.report(projectId, { reason, details: details.trim() || undefined }),
  })

  return (
    <Dialog
      title="Report this project"
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
        <p className="row" style={{ gap: 8, color: 'var(--green-ink)' }}>
          <Icon name="check" />
          Thanks — a moderator will review this.
        </p>
      ) : (
        <>
          <Field label="What is wrong with it?">
            <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {REPORT_REASONS.map((r) => (
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
              placeholder="Which part of the project, and why…"
            />
          </Field>
        </>
      )}
      {send.isError && <ErrorText>{(send.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
