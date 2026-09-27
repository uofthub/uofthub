import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, API_URL, ApiError } from '../../lib/api'
import { returnPath } from '../../lib/returnTo'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { Logo } from '../../components/shell'
import { ThemeToggle } from '../../components/shell/ThemeToggle'
import {
  Button,
  ErrorText,
  Eyebrow,
  Field,
  Icon,
  Input,
  LinkButton,
  SegmentedTabs,
  type IconName,
} from '../../components/ui'

/** Matches the domain rule the API enforces on /auth/register. */
const UOFT_DOMAINS = ['@mail.utoronto.ca', '@utoronto.ca']
const MIN_PASSWORD_LENGTH = 10

const HIGHLIGHTS: { icon: IconName; text: string }[] = [
  { icon: 'shieldCheck', text: 'Every account proves it owns a U of T email' },
  { icon: 'lock', text: 'You choose what’s public, U of T only, or a draft' },
  { icon: 'users', text: 'Credit every collaborator on the work you share' },
]

type Mode = 'login' | 'signup' | 'forgot'

/** What the Microsoft round trip can come back with, as `?error=`. */
const OAUTH_ERRORS: Record<string, string> = {
  domain: 'That Microsoft account isn’t a U of T one. Sign in with your utoronto.ca account.',
  oauth: 'Microsoft sign-in didn’t go through. Try again, or use your email and password.',
  unavailable: 'Microsoft sign-in isn’t set up here. Use your email and password instead.',
}

/** "Check your inbox", after anything that sent an email. */
function CheckEmail({ email, what, onBack }: { email: string; what: string; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-fill p-5">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="inbox" size={18} /> Check your inbox
      </p>
      <p className="text-15 text-ink-3">
        If <b>{email}</b> can {what}, a link is on its way. It can take a minute — check your junk
        folder too.
      </p>
      <LinkButton className="self-start" onClick={onBack}>
        Back to log in
      </LinkButton>
    </div>
  )
}

function CredentialsForm({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { refetch } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [show, setShow] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const email = form.email.trim().toLowerCase()
  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'login') {
        await api.auth.login({ email: form.email, password: form.password })
        return 'signed-in' as const
      }
      if (mode === 'signup')
        await api.auth.register({ name: form.name, email: form.email, password: form.password })
      else await api.auth.forgotPassword(email)
      return 'sent' as const
    },
    onSuccess: (outcome) => {
      // The session cookie arrives with the response; refetch drives the redirect.
      if (outcome === 'signed-in') refetch()
      else setSentTo(email)
    },
  })
  const resend = useMutation({
    mutationFn: () => api.auth.resendVerification(email),
    onSuccess: () => setSentTo(email),
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  if (sentTo)
    return (
      <CheckEmail
        email={sentTo}
        what={mode === 'forgot' ? 'sign in to uofthub' : 'finish signing up'}
        onBack={() => {
          setSentTo(null)
          setMode('login')
        }}
      />
    )

  const unverified = submit.error instanceof ApiError && submit.error.code === 'UNVERIFIED'
  const domainOk = !email || UOFT_DOMAINS.some((d) => email.endsWith(d))
  const complete =
    !!email &&
    (mode === 'forgot' ||
      (form.password.length > 0 &&
        (mode === 'login' || (!!form.name.trim() && form.password.length >= MIN_PASSWORD_LENGTH))))

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (complete && domainOk) submit.mutate()
      }}
    >
      {mode === 'forgot' && (
        <p className="text-15 text-ink-3">
          We’ll email you a link to choose a new password. It also works for an account that only
          signs in with Microsoft today.
        </p>
      )}
      {mode === 'signup' && (
        <Field label="Full name">
          <Input
            value={form.name}
            onChange={set('name')}
            autoComplete="name"
            placeholder="Jordan Lee"
            maxLength={80}
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
      {mode !== 'forgot' && (
        <Field
          label="Password"
          hint={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
        >
          <span className="relative block">
            <Input
              className="pr-12"
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
              className="absolute top-0.5 right-0.5"
            />
          </span>
        </Field>
      )}
      {submit.isError && (
        <ErrorText>
          {(submit.error as Error).message}
          {unverified && (
            <>
              {' '}
              <LinkButton onClick={() => resend.mutate()} disabled={resend.isPending}>
                Send the link again
              </LinkButton>
            </>
          )}
        </ErrorText>
      )}
      <Button
        type="submit"
        variant="primary"
        block
        disabled={!complete || !domainOk || submit.isPending}
      >
        {submit.isPending
          ? { login: 'Signing in…', signup: 'Creating account…', forgot: 'Sending…' }[mode]
          : { login: 'Log in', signup: 'Create account', forgot: 'Email me a link' }[mode]}
      </Button>
      {mode === 'login' && (
        <LinkButton className="self-center text-14" onClick={() => setMode('forgot')}>
          Forgot password?
        </LinkButton>
      )}
      {mode === 'forgot' && (
        <LinkButton className="self-center text-14" onClick={() => setMode('login')}>
          Back to log in
        </LinkButton>
      )}
    </form>
  )
}

/** Log in / sign up, drawn without the app's header. */
export default function SessionPage() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(
    (location.state as { mode?: Mode } | null)?.mode ?? 'login'
  )
  const oauthError = OAUTH_ERRORS[params.get('error') ?? '']
  useDocumentTitle({ login: 'Log in', signup: 'Sign up', forgot: 'Reset your password' }[mode])

  useEffect(() => {
    if (user) navigate(returnPath(), { replace: true })
  }, [user, navigate])

  return (
    <div className="flex min-h-screen bg-page">
      <aside className="hidden flex-[1_1_45%] flex-col justify-between gap-8 bg-panel px-14 py-10 text-white lg:flex">
        <div>
          <Logo tone="white" />
        </div>
        <div className="flex max-w-115 flex-col gap-4">
          <h1 className="font-display text-44 leading-[1.05] font-bold tracking-tightest">
            Everything you built, worth keeping.
          </h1>
          <p className="text-16 leading-[1.55] text-navy-text">
            A living portfolio of the projects, papers and prototypes you make at U of T — built as
            you go, not scrambled together the week an application is due.
          </p>
          <ul className="mt-3 flex flex-col gap-3.5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-3">
                <Icon name={h.icon} size={20} className="text-gold" />
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-13 text-navy-soft">Not affiliated with the University of Toronto.</p>
      </aside>

      <main className="relative flex flex-[1_1_55%] items-center justify-center px-6 py-10">
        <div className="absolute top-4 right-4 flex gap-1">
          <ThemeToggle bare />
          <Button variant="ghost" iconOnly icon="close" to="/" aria-label="Back to uofthub" />
        </div>
        <div className="flex w-full max-w-105 flex-col gap-5">
          <div className="lg:hidden">
            <Logo />
          </div>
          {oauthError && <ErrorText>{oauthError}</ErrorText>}
          <SegmentedTabs<Mode>
            label="Account"
            value={mode === 'forgot' ? 'login' : mode}
            onChange={setMode}
            options={[
              { value: 'login', label: 'Log in' },
              { value: 'signup', label: 'Sign up' },
            ]}
            itemClassName="flex-1"
          />
          <div>
            <h2 className="font-display text-30 font-bold tracking-tighter">
              {
                {
                  login: 'Welcome back',
                  signup: 'Create your account',
                  forgot: 'Forgot your password?',
                }[mode]
              }
            </h2>
            <p className="mt-1.5 text-15 text-muted">
              {mode === 'signup'
                ? 'Any current student, alum or faculty member with a U of T email can join. We’ll email you to confirm the address is yours.'
                : 'Sign in with the Microsoft account attached to your U of T email.'}
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
          <Eyebrow
            as="div"
            className="flex items-center gap-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line"
          >
            <span>or with email</span>
          </Eyebrow>
          <CredentialsForm key={mode} mode={mode} setMode={setMode} />
          <p className="text-center text-13 text-muted">
            Anything you mark public can be seen by anyone on the internet.
          </p>
        </div>
      </main>
    </div>
  )
}
