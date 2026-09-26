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
  Eyebrow,
  Field,
  Icon,
  Input,
  SegmentedTabs,
  type IconName,
} from '../../components/ui'

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
      className="flex flex-col gap-4"
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
          <SegmentedTabs<Mode>
            label="Account"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'login', label: 'Log in' },
              { value: 'signup', label: 'Sign up' },
            ]}
            itemClassName="flex-1"
          />
          <div>
            <h2 className="font-display text-30 font-bold tracking-tighter">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1.5 text-15 text-muted">
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
          <Eyebrow
            as="div"
            className="flex items-center gap-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line"
          >
            <span>or with email</span>
          </Eyebrow>
          <CredentialsForm key={mode} mode={mode} />
          <p className="text-center text-13 text-muted">
            Anything you mark public can be seen by anyone on the internet.
          </p>
        </div>
      </main>
    </div>
  )
}
