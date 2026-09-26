import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { returnPath } from '../../lib/returnTo'
import { Logo } from '../../components/shell'
import { Button, ErrorText, Field, Input, Spinner } from '../../components/ui'

/** Must match the API's minimum (lib/password.ts). */
const MIN_PASSWORD_LENGTH = 10

/** The frame both pages share: the logo and one narrow column, no app chrome. */
function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6 py-10">
      <div className="flex w-full max-w-105 flex-col gap-5">
        <Logo />
        <h1 className="font-display text-30 font-bold tracking-tighter">{title}</h1>
        {children}
      </div>
    </main>
  )
}

/** Once the new session is in, on to wherever the student was headed. */
function useSignedInRedirect() {
  const { user, refetch } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (user) navigate(returnPath(), { replace: true })
  }, [user, navigate])
  return refetch
}

/** /verify?token= — the link in the confirmation email. */
export function VerifyPage() {
  useDocumentTitle('Confirm your email')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const refetch = useSignedInRedirect()
  // A query rather than an effect: it runs once per token even when React
  // mounts the page twice, and a token only ever works once.
  const verify = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => api.auth.verify(token),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  useEffect(() => {
    if (verify.isSuccess) refetch()
  }, [verify.isSuccess, refetch])

  return (
    <Frame title="Confirming your email">
      {!token || verify.isError ? (
        <>
          <ErrorText>
            {verify.error?.message ?? 'That link is missing its token — open it from the email.'}
          </ErrorText>
          <Button variant="primary" to="/session">
            Go to log in
          </Button>
        </>
      ) : (
        <Spinner />
      )}
    </Frame>
  )
}

/** /reset?token= — choose a new password from the emailed link. */
export function ResetPage() {
  useDocumentTitle('Choose a password')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const refetch = useSignedInRedirect()
  const [password, setPassword] = useState('')
  const reset = useMutation({
    mutationFn: () => api.auth.resetPassword(token, password),
    onSuccess: () => refetch(),
  })

  return (
    <Frame title="Choose a password">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (password.length >= MIN_PASSWORD_LENGTH) reset.mutate()
        }}
      >
        <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {reset.isError && <ErrorText>{reset.error.message}</ErrorText>}
        <Button
          type="submit"
          variant="primary"
          block
          disabled={!token || password.length < MIN_PASSWORD_LENGTH || reset.isPending}
        >
          {reset.isPending ? 'Saving…' : 'Save and sign in'}
        </Button>
        <p className="text-13 text-muted">Saving signs you out on every other device.</p>
      </form>
    </Frame>
  )
}
