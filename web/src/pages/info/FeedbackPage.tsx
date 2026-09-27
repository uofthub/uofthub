import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  cx,
  Eyebrow,
  Field,
  Heading,
  Icon,
  Input,
  Notice,
  Page,
  PageLede,
  PageTitle,
  TextArea,
  toast,
  type IconName,
} from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { CONTACT_EMAIL, GITHUB_URL } from '../../lib/site'

type Kind = 'bug' | 'feature' | 'question' | 'report' | 'other'

const KINDS: {
  value: Kind
  icon: IconName
  label: string
  text: string
  subject: string
  placeholder: string
}[] = [
  {
    value: 'bug',
    icon: 'alert',
    label: 'Something’s broken',
    text: 'A bug, an error, or a page that looks wrong.',
    subject: 'Bug',
    placeholder: 'What did you do, what did you expect, and what happened instead?',
  },
  {
    value: 'feature',
    icon: 'sparkle',
    label: 'Request a feature',
    text: 'A file type, an integration, a better way to show your work.',
    subject: 'Feature request',
    placeholder: 'What would you like to do that you can’t today?',
  },
  {
    value: 'question',
    icon: 'info',
    label: 'Ask a question',
    text: 'How something works, or something the docs don’t cover.',
    subject: 'Question',
    placeholder: 'What would you like to know?',
  },
  {
    value: 'report',
    icon: 'flag',
    label: 'Report a problem',
    text: 'Harassment, stolen work, a take-down or an appeal.',
    subject: 'Report',
    placeholder: 'What happened, and where? Links to the project or profile help us act fast.',
  },
  {
    value: 'other',
    icon: 'comment',
    label: 'Something else',
    text: 'Add your club or lab, say hi, or anything at all.',
    subject: 'Feedback',
    placeholder: 'What’s on your mind?',
  },
]

const isKind = (v: string | null): v is Kind => KINDS.some((k) => k.value === v)

const OTHER_WAYS: { icon: IconName; title: string; text: string; href: string; cta: string }[] = [
  {
    icon: 'mail',
    title: 'Email us',
    text: 'Write to a person directly, from any email app.',
    href: `mailto:${CONTACT_EMAIL}`,
    cta: CONTACT_EMAIL,
  },
  {
    icon: 'branch',
    title: 'uofthub on GitHub',
    text: 'The code, the roadmap and what’s being worked on. Contributions welcome.',
    href: GITHUB_URL,
    cta: 'github.com/uofthub',
  },
]

export default function FeedbackPage() {
  useDocumentTitle('Feedback & report')
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const initial = params.get('type')
  const [kind, setKind] = useState<Kind>(isKind(initial) ? initial : 'bug')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [where, setWhere] = useState('')
  const [sent, setSent] = useState(false)

  const current = KINDS.find((k) => k.value === kind)!

  const choose = (k: Kind) => {
    setKind(k)
    setParams({ type: k }, { replace: true })
  }

  const subject = `[${current.subject}] ${summary.trim()}`
  const footer = [
    where.trim() && `Where: ${where.trim()}`,
    user && `From: ${user.name} (@${user.handle})`,
    `Browser: ${navigator.userAgent}`,
  ].filter(Boolean)
  const message = [details.trim(), '', '—', ...footer].join('\n')

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`

  const submit = (e: FormEvent) => {
    e.preventDefault()
    window.location.href = mailto
    setSent(true)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${CONTACT_EMAIL}\nSubject: ${subject}\n\n${message}`)
      toast('Copied — paste it into any email to ' + CONTACT_EMAIL)
    } catch {
      toast.error('Couldn’t copy. Select the text and copy it yourself.')
    }
  }

  const reset = () => {
    setSummary('')
    setDetails('')
    setWhere('')
    setSent(false)
  }

  return (
    <Page width="wide" className="flex flex-col gap-8">
      <header>
        <Eyebrow className="mb-2 flex items-center gap-1.5">
          <Icon name="megaphone" size={14} /> Feedback &amp; report
        </Eyebrow>
        <PageTitle>Tell us what you think</PageTitle>
        <PageLede className="max-w-170">
          uofthub is early and shaped by the people using it. Every message is read by a person on
          the team.
        </PageLede>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
          {/* What kind */}
          <section className="flex flex-col gap-3" aria-labelledby="kind">
            <Heading id="kind" className="text-19">
              What’s this about?
            </Heading>
            <div
              role="radiogroup"
              aria-labelledby="kind"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {KINDS.map((k) => {
                const on = k.value === kind
                return (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(k.value)}
                    className={cx(
                      'relative flex items-start gap-3 rounded-card border p-4 text-left transition-colors',
                      on
                        ? 'border-navy-ink bg-navy-wash outline-2 -outline-offset-1 outline-navy-ink'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-fill-soft'
                    )}
                  >
                    <span
                      className={cx(
                        'flex size-9 shrink-0 items-center justify-center rounded-btn',
                        on ? 'bg-navy text-white' : 'bg-navy-tint text-navy-ink',
                        k.value === 'report' && !on && 'bg-red-tint text-red'
                      )}
                    >
                      <Icon name={k.icon} size={18} />
                    </span>
                    <span className="flex flex-col gap-0.5 pr-5">
                      <span className="text-15 font-semibold text-ink">{k.label}</span>
                      <span className="text-13 leading-snug text-muted">{k.text}</span>
                    </span>
                    {on && (
                      <Icon
                        name="check"
                        size={16}
                        className="absolute top-4 right-4 text-navy-ink"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {kind === 'report' && (
            <Notice tone="gold" icon="shieldCheck" title="Reporting a project, profile or message?">
              The fastest route is the <strong>Report</strong> option in its menu — it goes straight
              to a moderator with everything they need attached. Use this form for take-downs,
              appeals, or anything that doesn’t fit there.
            </Notice>
          )}

          {/* The message */}
          <Card className="p-6 md:p-7">
            {sent ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-green-tint text-green-ink">
                  <Icon name="check" size={28} />
                </span>
                <h2 className="font-display text-24 font-bold tracking-tight">
                  Your email app should be open
                </h2>
                <p className="max-w-110 text-15 leading-normal text-muted">
                  Your message is written and addressed to {CONTACT_EMAIL} — just hit send. If
                  nothing opened, copy it and paste it into any email.
                </p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  <Button size="md" icon="file" onClick={copy}>
                    Copy message
                  </Button>
                  <Button size="md" icon="mail" href={mailto}>
                    Try again
                  </Button>
                  <Button size="md" variant="ghost" onClick={reset}>
                    Write another
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-5">
                <Field label="Summary" hint="One line — it becomes the subject.">
                  <Input
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder={
                      kind === 'feature' ? 'Let me embed Figma files' : 'Short and specific'
                    }
                    maxLength={120}
                    required
                  />
                </Field>
                <Field label="Details">
                  <TextArea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder={current.placeholder}
                    rows={7}
                    required
                  />
                </Field>
                {(kind === 'bug' || kind === 'report') && (
                  <Field
                    label={
                      <span>
                        Link <span className="font-normal text-muted">(optional)</span>
                      </span>
                    }
                    hint="The page, project or profile this is about."
                  >
                    <Input
                      type="url"
                      value={where}
                      onChange={(e) => setWhere(e.target.value)}
                      placeholder="https://uofthub.com/@…"
                    />
                  </Field>
                )}
                <div className="flex flex-col-reverse gap-4 border-t border-line-soft pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-13 text-muted">
                    <Icon name="lock" size={14} />
                    {user
                      ? 'Sent from your own email, with your name and handle attached.'
                      : 'Sent from your own email app — nothing is stored here.'}
                  </p>
                  <Button
                    type="submit"
                    variant="primary"
                    icon="send"
                    disabled={!summary.trim() || !details.trim()}
                  >
                    Write the email
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        {/* Other ways */}
        <aside className="flex flex-col gap-4">
          <Eyebrow>Other ways to reach us</Eyebrow>
          {OTHER_WAYS.map((w) => (
            <a
              key={w.title}
              href={w.href}
              target={w.href.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="group"
            >
              <Card className="flex gap-3.5 p-5 transition-colors group-hover:border-line-strong">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-btn bg-navy-tint text-navy-ink">
                  <Icon name={w.icon} size={20} />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-display text-17 font-bold">{w.title}</span>
                  <span className="text-14 leading-snug text-muted">{w.text}</span>
                  <span className="mt-1 inline-flex items-center gap-1 truncate text-14 font-semibold text-navy-ink group-hover:underline">
                    {w.cta}
                    {w.href.startsWith('http') && <Icon name="external" size={12} />}
                  </span>
                </span>
              </Card>
            </a>
          ))}

          <Card className="flex flex-col gap-3 bg-fill-warm p-5">
            <span className="flex items-center gap-2 font-display text-17 font-bold">
              <Icon name="file" size={18} className="text-navy-ink" />
              Check the docs first
            </span>
            <p className="text-14 leading-snug text-muted">
              Visibility, collaborators, notifications and reporting are all explained there.
            </p>
            <Link
              to="/docs"
              className="inline-flex items-center gap-1 text-14 font-semibold text-navy-ink hover:underline"
            >
              Read the docs <Icon name="chevronRight" size={14} />
            </Link>
          </Card>

          <p className="px-1 text-13 leading-normal text-muted">
            Found a security issue? Email {CONTACT_EMAIL} with “Security” in the subject and don’t
            post it publicly. See{' '}
            <Link to="/terms" className="underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline">
              Privacy
            </Link>{' '}
            for how we handle reports.
          </p>
        </aside>
      </div>
    </Page>
  )
}
