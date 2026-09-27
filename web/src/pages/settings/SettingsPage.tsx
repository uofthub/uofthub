import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { disablePush, enablePush, isIos, pushState } from '../../lib/push'
import {
  Button,
  Dialog,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Notice,
  Page,
  PageTitle,
  Panel,
  Spinner,
  SuccessText,
  Toggle,
} from '../../components/ui'

/** Must match the API's minimum (lib/password.ts). */
const MIN_PASSWORD_LENGTH = 10

function PasswordPanel({ hasPassword }: { hasPassword: boolean }) {
  const { refetch } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const change = useMutation({
    mutationFn: () =>
      api.auth.changePassword({
        currentPassword: hasPassword ? current : undefined,
        newPassword: next,
      }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      refetch()
    },
  })

  return (
    <Panel title={hasPassword ? 'Password' : 'Add a password'} size="main">
      {!hasPassword && (
        <p className="text-15 text-ink-3">
          You sign in with Microsoft. A password lets you sign in with your email too.
        </p>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          change.mutate()
        }}
      >
        {hasPassword && (
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
        )}
        <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        {change.isError && <ErrorText>{change.error.message}</ErrorText>}
        {change.isSuccess && (
          <SuccessText>Saved. You’ve been signed out on every other device.</SuccessText>
        )}
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          disabled={
            next.length < MIN_PASSWORD_LENGTH || (hasPassword && !current) || change.isPending
          }
        >
          {change.isPending ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </Panel>
  )
}

function DeleteAccountDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { refetch } = useAuth()
  const [typed, setTyped] = useState('')
  const remove = useMutation({
    mutationFn: () => api.users.deleteAccount(typed.trim()),
    onSuccess: () => {
      qc.clear()
      refetch()
      navigate('/', { replace: true })
    },
  })
  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  return (
    <Dialog
      title="Delete your account?"
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Keep my account</Button>
          <Button
            variant="danger"
            onClick={() => remove.mutate()}
            disabled={!matches || remove.isPending}
          >
            {remove.isPending ? 'Deleting…' : 'Delete everything'}
          </Button>
        </>
      }
    >
      <p>
        This deletes your profile, every project you own and their files, your comments, reactions,
        saves, collections and messages. Projects you collaborated on stay with their owners. It
        cannot be undone.
      </p>
      <Field label={`Type ${email} to confirm`}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Field>
      {remove.isError && <ErrorText>{remove.error.message}</ErrorText>}
    </Dialog>
  )
}

/**
 * Push notifications on this device. Per browser, so it asks the browser —
 * not the account — whether it is on.
 */
/** The account-wide switches: what is worth a buzz, on every device that has push on. */
const PUSH_CATEGORIES = [
  { key: 'pushMessages', label: 'Messages', hint: 'Who wrote, never what they said.' },
  {
    key: 'pushAnswers',
    label: 'Things that need an answer',
    hint: 'Invitations, access and group requests, moderation decisions.',
  },
  {
    key: 'pushActivity',
    label: 'Activity on your work',
    hint: 'Comments, replies, reactions, follows and “want to collab”.',
  },
] as const

function PushPanel() {
  const qc = useQueryClient()
  const { user, refetch } = useAuth()
  const category = useMutation({
    mutationFn: (change: Partial<Record<(typeof PUSH_CATEGORIES)[number]['key'], boolean>>) =>
      api.users.updateMe(change),
    onSuccess: () => refetch(),
  })
  const state = useQuery({ queryKey: ['push-state'], queryFn: pushState, staleTime: Infinity })
  const toggle = useMutation({
    mutationFn: async (on: boolean) =>
      on ? enablePush() : disablePush().then(() => 'off' as const),
    onSuccess: (next) => qc.setQueryData(['push-state'], next),
  })

  let body
  if (state.isPending) body = <Spinner />
  else if (state.data === 'unsupported')
    body = (
      <p className="text-15 text-ink-3">
        {isIos()
          ? 'On an iPhone or iPad, add uofthub to your home screen first: tap Share, then “Add to Home Screen”, and open it from there.'
          : 'This browser can’t show notifications from websites.'}
      </p>
    )
  else if (state.data === 'unavailable' || state.isError)
    body = <p className="text-15 text-ink-3">Push notifications aren’t available right now.</p>
  else if (state.data === 'blocked')
    body = (
      <p className="text-15 text-ink-3">
        Notifications are blocked for uofthub in this browser. Allow them in the browser’s site
        settings, then come back here.
      </p>
    )
  else
    body = (
      <>
        <Toggle
          checked={state.data === 'on'}
          onChange={(on) => !toggle.isPending && toggle.mutate(on)}
        >
          Notify me on this device
        </Toggle>
        <p className="text-13 text-muted">
          Even with uofthub closed. Only on this device — turn it on on each one you want them on.
          Nothing buzzes while you have uofthub open in front of you.
        </p>
        {state.data === 'on' && user && (
          <>
            <hr />
            <p className="text-13 text-muted">What to push, on every device:</p>
            {PUSH_CATEGORIES.map((c) => (
              <div key={c.key} className="flex flex-col gap-0.5">
                <Toggle
                  checked={user[c.key]}
                  onChange={(on) => !category.isPending && category.mutate({ [c.key]: on })}
                >
                  {c.label}
                </Toggle>
                <p className="text-13 text-muted">{c.hint}</p>
              </div>
            ))}
            <p className="text-13 text-muted">
              Updates to projects you follow stay in the bell, however many there are.
            </p>
          </>
        )}
      </>
    )

  return (
    <Panel title="Push notifications" size="main">
      {body}
      {toggle.isError && <ErrorText>{toggle.error.message}</ErrorText>}
      {category.isError && <ErrorText>{category.error.message}</ErrorText>}
    </Panel>
  )
}

/** /settings — the account itself, as opposed to the public profile. */
export default function SettingsPage() {
  useDocumentTitle('Settings')
  const { user, loading, refetch } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState(false)

  const prefs = useMutation({
    mutationFn: (emailNotifications: boolean) => api.users.updateMe({ emailNotifications }),
    onSuccess: () => refetch(),
  })
  const everywhere = useMutation({
    // The API forgets every subscription; this browser's is unsubscribed too.
    mutationFn: () => disablePush().then(() => api.auth.logoutEverywhere()),
    onSuccess: () => {
      qc.clear()
      refetch()
      navigate('/session', { replace: true })
    },
  })

  if (loading) return <Spinner />
  if (!user)
    return (
      <Page width="narrow">
        <EmptyState
          icon="lock"
          title="Sign in to see your settings"
          action={
            <Button variant="primary" to="/session">
              Log in
            </Button>
          }
        />
      </Page>
    )

  return (
    <Page width="narrow" className="flex flex-col gap-6">
      {deleting && <DeleteAccountDialog email={user.email} onClose={() => setDeleting(false)} />}
      <PageTitle>Settings</PageTitle>

      {user.suspendedAt && (
        <Notice tone="danger" icon="alert" title="Your account is suspended">
          A moderator suspended it on {new Date(user.suspendedAt).toLocaleDateString()}. You can
          still read, export your data or delete your account, but not post, comment, react, follow
          or message.
        </Notice>
      )}

      <Panel title="Account" size="main">
        <p className="text-15">
          Signed in as <b>{user.email}</b>. Your name, faculty and links are on{' '}
          <a href={`/u/${user.id}`}>your profile</a>.
        </p>
      </Panel>

      <PasswordPanel hasPassword={user.hasPassword} />

      <Panel title="Email" size="main">
        <Toggle checked={user.emailNotifications} onChange={(on) => prefs.mutate(on)}>
          Email me about things that need an answer
        </Toggle>
        <p className="text-13 text-muted">
          Collaborator and group invitations, access requests, new conversations and moderation
          decisions. Everything else stays in the bell.
        </p>
        {prefs.isError && <ErrorText>{prefs.error.message}</ErrorText>}
      </Panel>

      <PushPanel />

      <Panel title="Sessions" size="main">
        <p className="text-15 text-ink-3">
          Signed in somewhere you shouldn’t be? This signs you out on every device, this one too.
        </p>
        <Button
          className="self-start"
          onClick={() => everywhere.mutate()}
          disabled={everywhere.isPending}
        >
          Sign out everywhere
        </Button>
      </Panel>

      <Panel title="Your data" size="main">
        <p className="text-15 text-ink-3">
          Download a copy of everything you’ve put on uofthub as a JSON file — your profile,
          projects, comments, collections and the messages you’ve sent. Files you uploaded are
          listed; download them from each project.
        </p>
        <Button className="self-start" icon="download" href={api.users.exportUrl()}>
          Download my data
        </Button>
        <hr />
        <p className="text-15 text-ink-3">
          Deleting your account removes it and everything you own, for good.
        </p>
        <Button variant="danger" className="self-start" onClick={() => setDeleting(true)}>
          Delete my account
        </Button>
      </Panel>
    </Page>
  )
}
