import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReportStatus } from '@uofthub/types'
import { api, type AdminMessageReport, type MessageReportDecision } from '../../lib/api'
import { reasonShort } from '../../lib/moderation'
import { Button, Chip, ErrorText, Pill, TextArea } from '../../components/ui'

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
    <article className="card stack" style={{ padding: 22, gap: 12 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <Link to={`/u/${reported.id}`} className="disp" style={{ fontSize: 19, fontWeight: 700 }}>
          {reported.name}
        </Link>
        <Chip size="sm" tone="navy">
          {reasonShort(report.reason)}
        </Chip>
        <Pill dot={STATUS[report.status].dot}>{STATUS[report.status].label}</Pill>
        <span className="muted push" style={{ fontSize: 13 }}>
          {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Sender {reported.email} · reported by <Link to={`/u/${reporter.id}`}>{reporter.name}</Link>{' '}
        ({reporter.email})
      </div>
      {report.details && <p style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>“{report.details}”</p>}

      <ol className="stack" style={{ gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
        {report.messages.map((m, i) => {
          const fromReported = m.senderId === reported.id
          return (
            <li
              key={i}
              style={{
                fontSize: 14,
                padding: '6px 10px',
                borderRadius: 8,
                background: fromReported ? 'var(--fill)' : undefined,
              }}
            >
              <b>{fromReported ? reported.name : reporter.name}</b>{' '}
              <span className="muted" style={{ fontSize: 12 }}>
                {new Date(m.createdAt).toLocaleString()}
              </span>
              <p style={{ whiteSpace: 'pre-wrap', margin: '2px 0 0' }}>{m.body}</p>
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
          <div className="row wrap" style={{ gap: 8 }}>
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
          </div>
        </>
      ) : (
        <div className="row wrap muted" style={{ fontSize: 13, gap: 8 }}>
          <span>
            {report.reviewedBy ? `Decided by ${report.reviewedBy.name}` : 'Decided'}
            {report.reviewedAt && ` on ${new Date(report.reviewedAt).toLocaleDateString()}`}
            {report.reviewNote && ` — “${report.reviewNote}”`}
          </span>
          {reported.messagingSuspendedAt && (
            <Button
              size="sm"
              className="push"
              onClick={() => lift.mutate()}
              disabled={lift.isPending}
            >
              Lift suspension
            </Button>
          )}
        </div>
      )}
      {error && <ErrorText>{(error as Error).message}</ErrorText>}
    </article>
  )
}
