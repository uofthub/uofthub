import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, API_URL } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { Logo } from '../../components/shell'
import { ThemeToggle } from '../../components/shell/ThemeToggle'
import {
  Button,
  ErrorText,
  Field,
  Icon,
  Input,
  SegmentedTabs,
  type IconName,
} from '../../components/ui'
import './session.css'

/** Matches the domain rule the API enforces on /auth/register. */
const UOFT_DOMAINS = ['@mail.utoronto.ca', '@utoronto.ca']
const MIN_PASSWORD_LENGTH = 10

const HIGHLIGHTS: { icon: IconName; text: string }[] = [
  { icon: 'shieldCheck', text: 'Verified with your U of T email' },
  { icon: 'lock', text: 'You choose what’s public, U of T only, or a draft' },
  { icon: 'users', text: 'Credit every collaborator on the work you share' },
]

type Mode = 'login' | 'signup'

function CredentialsForm({ mode }: { mode: Mode }) {
  const { refetch } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [show, setShow] = useState(false)

  const submit = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? api.auth.login({ email: form.email, password: form.password })
        : api.auth.register({ name: form.name, email: form.email, password: form.password }),
    // The session cookie arrives with the response; refetch drives the redirect.
    onSuccess: () => refetch(),
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const email = form.email.trim().toLowerCase()
  const domainOk = !email || UOFT_DOMAINS.some((d) => email.endsWith(d))
  const complete =
    !!email &&
    form.password.length > 0 &&
    (mode === 'login' || (!!form.name.trim() && form.password.length >= MIN_PASSWORD_LENGTH))

  return (
    <form
      className="stack"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (complete && domainOk) submit.mutate()
      }}
    >
      {mode === 'signup' && (
        <Field label="Full name">
          <Input
            value={form.name}
            onChange={set('name')}
            autoComplete="name"
            placeholder="Jordan Lee"
          />
        </Field>
      )}
      <Field label="U of T email" hint={domainOk ? undefined : 'Use your utoronto.ca address.'}>
        <Input
          type="email"
          value={form.email}
          onChange={set('email')}
          autoComplete="email"
          placeholder="you@mail.utoronto.ca"
        />
      </Field>
      <Field
        label="Password"
        hint={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
      >
        <span className="pw">
          <Input
            type={show ? 'text' : 'password'}
            value={form.password}
            onChange={set('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••••"
          />
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={show ? 'eyeOff' : 'eye'}
            aria-label={show ? 'Hide password' : 'Show password'}
            onClick={() => setShow((s) => !s)}
            className="pw__toggle"
          />
        </span>
      </Field>
      {submit.isError && <ErrorText>{(submit.error as Error).message}</ErrorText>}
      <Button
        type="submit"
        variant="primary"
        block
        disabled={!complete || !domainOk || submit.isPending}
      >
        {submit.isPending
          ? mode === 'login'
            ? 'Signing in…'
            : 'Creating account…'
          : mode === 'login'
            ? 'Log in'
            : 'Create account'}
      </Button>
    </form>
  )
}

/** Log in / sign up, drawn without the app's header. */
export default function SessionPage() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>(
    (location.state as { mode?: Mode } | null)?.mode ?? 'login'
  )
  useDocumentTitle(mode === 'login' ? 'Log in' : 'Sign up')

  useEffect(() => {
    if (user) navigate('/feed', { replace: true })
  }, [user, navigate])

  return (
    <div className="session">
      <aside className="session__brand">
        <div className="session__logo">
          <Logo tone="white" />
        </div>
        <div className="stack" style={{ gap: 16, maxWidth: 460 }}>
          <h1 className="disp session__title">Everything you built, worth keeping.</h1>
          <p className="session__lede">
            A living portfolio of the projects, papers and prototypes you make at U of T — built as
            you go, not scrambled together the week an application is due.
          </p>
          <ul className="stack" style={{ gap: 14, listStyle: 'none', padding: 0, marginTop: 12 }}>
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="row" style={{ gap: 12 }}>
                <Icon name={h.icon} size={20} style={{ color: 'var(--gold)' }} />
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="session__fine">Not affiliated with the University of Toronto.</p>
      </aside>

      <main className="session__form">
        <div className="session__close">
          <ThemeToggle bare />
          <Button variant="ghost" iconOnly icon="close" to="/" aria-label="Back to uofthub" />
        </div>
        <div className="stack" style={{ gap: 20, width: '100%', maxWidth: 420 }}>
          <div className="session__mobile-logo">
            <Logo />
          </div>
          <SegmentedTabs<Mode>
            label="Account"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'login', label: 'Log in' },
              { value: 'signup', label: 'Sign up' },
            ]}
            className="session__tabs"
          />
          <div>
            <h2 className="disp" style={{ fontSize: 30, letterSpacing: '-0.02em' }}>
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="muted" style={{ marginTop: 6, fontSize: 15 }}>
              {mode === 'login'
                ? 'Sign in with the Microsoft account attached to your U of T email.'
                : 'Any current student, alum or faculty member with a U of T email can join.'}
            </p>
          </div>
          <Button
            block
            icon="shieldCheck"
            onClick={() => {
              window.location.href = `${API_URL}/auth/microsoft`
            }}
          >
            {mode === 'login' ? 'Continue with UTORid' : 'Sign up with UTORid'}
          </Button>
          <div className="session__or">
            <span>or with email</span>
          </div>
          <CredentialsForm key={mode} mode={mode} />
          <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            Anything you mark public can be seen by anyone on the internet.
          </p>
        </div>
      </main>
    </div>
  )
}
