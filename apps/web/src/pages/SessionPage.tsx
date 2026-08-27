import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { useUI } from '../lib/ui'
import { api } from '../lib/api'
import { Btn, Chip, Divider, ErrorText, Field, Icon, TextField, cx } from '../components/ui'
import Mark from '../components/Mark'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

/** Matches the domain rule the API enforces on /auth/register. */
const UOFT_DOMAINS = ['@mail.utoronto.ca', '@utoronto.ca']
const MIN_PASSWORD_LENGTH = 10

const HIGHLIGHTS = [
  { icon: 'mdi-shield-check-outline', text: 'Verified with your @mail.utoronto.ca account' },
  { icon: 'mdi-eye-off-outline', text: 'You choose what stays private and what goes public' },
  { icon: 'mdi-account-multiple-outline', text: 'Credit every collaborator on the work you share' },
]

type Mode = 'login' | 'signup'

/** Email + password form. Microsoft stays available above it. */
function CredentialsForm({ mode }: { mode: Mode }) {
  const { refetch } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? api.auth.login({ email: form.email, password: form.password })
        : api.auth.register({ name: form.name, email: form.email, password: form.password }),
    // The session cookie is set by the response; refetch drives the redirect.
    onSuccess: () => refetch(),
  })

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const email = form.email.trim().toLowerCase()
  const domainOk = !email || UOFT_DOMAINS.some(d => email.endsWith(d))
  const complete =
    email &&
    form.password.length > 0 &&
    (mode === 'login' || (form.name.trim() && form.password.length >= MIN_PASSWORD_LENGTH))

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        if (complete && domainOk) mutation.mutate()
      }}
      style={{ display: 'grid', gap: 16 }}
    >
      {mode === 'signup' && (
        <Field label="Full name">
          <TextField
            value={form.name}
            onChange={set('name')}
            autoComplete="name"
            placeholder="Jordan Lee"
          />
        </Field>
      )}

      <Field label="U of T email" hint={domainOk ? undefined : 'Use your utoronto.ca address.'}>
        <TextField
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
        <TextField
          type={showPassword ? 'text' : 'password'}
          value={form.password}
          onChange={set('password')}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="••••••••••"
          appendIcon={
            <Btn
              icon
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <Icon name={showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'} size={20} />
            </Btn>
          }
        />
      </Field>

      {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}

      <Btn variant="accent" size="large" block type="submit" disabled={!complete || !domainOk || mutation.isPending}>
        {mutation.isPending
          ? mode === 'login'
            ? 'Signing in…'
            : 'Creating account…'
          : mode === 'login'
            ? 'Log in'
            : 'Create account'}
      </Btn>
    </form>
  )
}

/**
 * Log in / Sign up. Rendered without the app bar or drawer, the way
 * uoftindex.ca's `/session` route is.
 */
export default function SessionPage() {
  const { user } = useAuth()
  const { darkMode, setDarkMode } = useUI()
  const location = useLocation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>((location.state as { mode?: Mode } | null)?.mode ?? 'login')

  useEffect(() => {
    if (user) navigate('/projects', { replace: true })
  }, [user, navigate])

  const signIn = () => {
    window.location.href = `${API_URL}/auth/microsoft`
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--v-background-base)' }}>
      {/* Brand panel */}
      <div
        style={{
          flex: '1 1 45%',
          background: 'var(--navy)',
          color: '#fff',
          padding: '48px 56px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
        className="on-navy max-lg:hidden"
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
          <Mark size={32} />
          <span className="heading">uofthub</span>
        </Link>

        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff', lineHeight: 1.15 }}>
            Everything you built, worth keeping.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', marginTop: 16 }}>
            A living portfolio of the projects, papers and prototypes you make at U of T — assembled as you go,
            not scrambled together the week before an application is due.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '32px 0 0', display: 'grid', gap: 16 }}>
            {HIGHLIGHTS.map(h => (
              <li key={h.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon name={h.icon} size={22} color="var(--navy-accent)" />
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9375rem' }}>{h.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8125rem', margin: 0 }}>
          Not affiliated with the University of Toronto.
        </p>
      </div>

      {/* Form panel */}
      <div
        style={{
          flex: '1 1 55%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 20, right: 24, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Btn icon onClick={() => setDarkMode(!darkMode)} aria-label="Toggle theme">
            <Icon name={darkMode ? 'mdi-white-balance-sunny' : 'mdi-weather-night'} size={22} />
          </Btn>
          <Btn to="/">
            <Icon name="mdi-close" size={20} />
          </Btn>
        </div>

        <div style={{ width: '100%', maxWidth: 420 }}>
          <Link to="/" className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <Mark size={30} />
            <span className="heading" style={{ color: 'var(--v-text-base)' }}>
              uofthub
            </span>
          </Link>

          {/* Mode toggle */}
          <div
            style={{
              display: 'flex',
              padding: 4,
              gap: 4,
              borderRadius: 8,
              background: 'var(--v-border-base)',
              marginBottom: 28,
            }}
          >
            {(['login', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cx('v-btn', mode === m && 'v-btn--accent')}
                style={{ flex: 1 }}
              >
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text--secondary" style={{ marginTop: 8 }}>
            {mode === 'login'
              ? 'Sign in with the Microsoft account attached to your U of T email.'
              : 'Any current student, alum or faculty member with a U of T email can join.'}
          </p>

          <Btn variant="outlined" size="large" block onClick={signIn} style={{ marginTop: 24 }}>
            <Icon name="mdi-microsoft" size={20} />
            {mode === 'login' ? 'Continue with UTORid' : 'Sign up with UTORid'}
          </Btn>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <Divider />
            <span className="text--disabled" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
              OR WITH EMAIL
            </span>
            <Divider />
          </div>

          <CredentialsForm key={mode} mode={mode} />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 24 }}>
            <Chip small color="blue">
              @mail.utoronto.ca
            </Chip>
            <Chip small color="blue">
              @utoronto.ca
            </Chip>
          </div>

          <p className="text--disabled" style={{ fontSize: '0.8125rem', marginTop: 20, textAlign: 'center' }}>
            By continuing you agree that anything you mark public can be seen by anyone on the internet.
          </p>
        </div>
      </div>
    </div>
  )
}
