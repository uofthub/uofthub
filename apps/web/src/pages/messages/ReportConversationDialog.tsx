import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReportReason } from '@uofthub/types'
import { api, type ChatPerson } from '../../lib/api'
import { MESSAGE_REPORT_REASONS } from '../../lib/moderation'
import {
  Button,
  Dialog,
  ErrorText,
  Field,
  Select,
  SuccessText,
  TextArea,
  Toggle,
} from '../../components/ui'

/** Report a conversation to moderators — and, unless they say otherwise, block the sender. */
export function ReportConversationDialog({
  person,
  onClose,
}: {
  person: ChatPerson
  onClose: () => void
}) {
  const qc = useQueryClient()
  const first = person.name.split(/\s+/)[0]
  const [reason, setReason] = useState<ReportReason>(MESSAGE_REPORT_REASONS[0].value)
  const [details, setDetails] = useState('')
  const [block, setBlock] = useState(true)
  const send = useMutation({
    mutationFn: () =>
      api.messages.report(person.id, { reason, details: details.trim() || undefined, block }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', 'thread', person.id] })
      qc.invalidateQueries({ queryKey: ['messages', 'conversations'] })
    },
  })

  return (
    <Dialog
      title="Report this conversation"
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
        <SuccessText>
          Thanks — a moderator will review this.{block && ` ${first} can no longer message you.`}
        </SuccessText>
      ) : (
        <>
          <Field label="What is wrong?">
            <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {MESSAGE_REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Anything else we should know?"
            hint="Optional. Your last 30 messages with them are sent with the report."
          >
            <TextArea
              rows={4}
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What happened, and whether it has happened before…"
            />
          </Field>
          <Toggle checked={block} onChange={setBlock}>
            Also block {first} — they won’t be told
          </Toggle>
        </>
      )}
      {send.isError && <ErrorText>{(send.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
