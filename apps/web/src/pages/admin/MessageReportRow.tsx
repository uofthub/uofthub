import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReportStatus } from '@uofthub/types'
import { api, type AdminMessageReport, type MessageReportDecision } from '../../lib/api'
import { reasonShort } from '../../lib/moderation'
import { Button, Chip, cx, ErrorText, Pill, TextArea } from '../../components/ui'
import { Decisions, QueueCard, Quote } from './QueueCard'

const STATUS: Record<ReportStatus, { label: string; dot: string }> = {
  OPEN: { label: 'Open', dot: '#C07A00' },
  DISMISSED: { label: 'Dismissed', dot: '#8A8E98' },
  WARNED: { label: 'Sender warned', dot: '#1E3765' },
  TAKEN_DOWN: { label: 'Messaging suspended', dot: '#C0392B' },
}

const DECISIONS: { value: MessageReportDecision; label: string; hint: string }[] = [
  {
    value: 'DISMISS',
    label: 'Dismiss',
    hint: 'Nothing wrong — closes the report; nobody is told.',
  },
  { value: 'WARN', label: 'Warn sender', hint: 'Notifies the sender with your note.' },
  {
    value: 'SUSPEND',
    label: 'Suspend messaging',
    hint: 'The sender can read but not send until lifted, and is notified.',
  },
]

/** A reported conversation: who, why, the thread as filed, and the decision. */
export function MessageReportRow({ report }: { report: AdminMessageReport }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-message-reports'] })
  const decide = useMutation({
    mutationFn: (decision: MessageReportDecision) =>
      api.admin.decideMessageReport(report.id, { decision, note: note.trim() || undefined }),
    onSuccess: refresh,
  })
  const lift = useMutation({
    mutationFn: () => api.admin.liftMessagingSuspension(report.reported.id),
    onSuccess: refresh,
  })
  const { reporter, reported } = report
  const error = decide.error || lift.error

  return (
    <QueueCard
      to={`/u/${reported.id}`}
      title={reported.name}
      tags={
        <>
          <Chip size="sm" tone="navy">
            {reasonShort(report.reason)}
          </Chip>
          <Pill dot={STATUS[report.status].dot}>{STATUS[report.status].label}</Pill>
        </>
      }
      when={new Date(report.createdAt).toLocaleString()}
      meta={
        <>
          Sender {reported.email} · reported by{' '}
          <Link to={`/u/${reporter.id}`}>{reporter.name}</Link> ({reporter.email})
        </>
      }
    >
      {report.details && <Quote>{report.details}</Quote>}

      <ol className="flex flex-col gap-1.5">
        {report.messages.map((m, i) => {
          const fromReported = m.senderId === reported.id
          return (
            <li
              key={i}
              className={cx('rounded-lg px-2.5 py-1.5 text-14', fromReported && 'bg-fill')}
            >
              <b>{fromReported ? reported.name : reporter.name}</b>{' '}
              <span className="text-12 text-muted">{new Date(m.createdAt).toLocaleString()}</span>
              <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
            </li>
          )
        })}
      </ol>

      {report.status === 'OPEN' ? (
        <>
          <TextArea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to the sender (sent with a warning or suspension)…"
          />
          <Decisions>
            {DECISIONS.map((d) => (
              <Button
                key={d.value}
                size="sm"
                variant={d.value === 'SUSPEND' ? 'danger' : 'default'}
                title={d.hint}
                onClick={() => decide.mutate(d.value)}
                disabled={decide.isPending}
              >
                {d.label}
              </Button>
            ))}
          </Decisions>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-13 text-muted">
          <span>
            {report.reviewedBy ? `Decided by ${report.reviewedBy.name}` : 'Decided'}
            {report.reviewedAt && ` on ${new Date(report.reviewedAt).toLocaleDateString()}`}
            {report.reviewNote && ` — “${report.reviewNote}”`}
          </span>
          {reported.messagingSuspendedAt && (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => lift.mutate()}
              disabled={lift.isPending}
            >
              Lift suspension
            </Button>
          )}
        </div>
      )}
      {error && <ErrorText>{(error as Error).message}</ErrorText>}
    </QueueCard>
  )
}
