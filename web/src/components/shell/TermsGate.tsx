import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button, Dialog, ErrorText } from '../ui'

/** Pages someone must be able to read before agreeing to them. */
const READABLE = new Set(['/terms', '/privacy'])

/**
 * Asks a signed-in account to agree to the Terms as they stand — the first
 * time it signs in with Microsoft, and again whenever the Terms change. Until
 * it does, the API refuses every write (TERMS_NOT_ACCEPTED), so closing this
 * only lets them keep reading; it comes back on the next page.
 */
export function TermsGate() {
  const { user, refetch, logout } = useAuth()
  const { pathname } = useLocation()
  const [agreed, setAgreed] = useState(false)
  const [dismissedOn, setDismissedOn] = useState<string | null>(null)
  const accept = useMutation({ mutationFn: api.auth.acceptTerms, onSuccess: () => refetch() })

  if (!user || user.termsCurrent || READABLE.has(pathname) || dismissedOn === pathname) return null
  const returning = !!user.termsAcceptedAt

  return (
    <Dialog
      title={returning ? 'Our Terms have changed' : 'Before you start'}
      onClose={() => setDismissedOn(pathname)}
      footer={
        <>
          <Button variant="ghost" onClick={() => void logout()}>
            Sign out
          </Button>
          <Button
            variant="primary"
            disabled={!agreed || accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? 'Saving…' : 'Continue'}
          </Button>
        </>
      }
    >
      <p className="text-15 text-ink-2">
        {returning
          ? 'Please read the updated Terms. You can keep browsing, but you can’t post, comment or message until you agree.'
          : 'uofthub is for your academic and creative work. To post, comment or message, agree to the rules everyone here follows.'}
      </p>
      <ul className="list-disc pl-5.5 text-15 text-ink-2 [&_li]:mb-1.5">
        <li>No sexual content or nudity, and nothing that sexualises anyone.</li>
        <li>No harassment, hate, or other people’s work or personal information.</li>
        <li>You are responsible for what you post; reported content can be taken down.</li>
      </ul>
      <label className="flex cursor-pointer items-start gap-2.5 text-15">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-navy"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          I have read and agree to the{' '}
          <Link to="/terms" target="_blank" className="font-semibold text-navy-ink underline">
            Terms
          </Link>{' '}
          and the{' '}
          <Link to="/privacy" target="_blank" className="font-semibold text-navy-ink underline">
            Privacy policy
          </Link>
          .
        </span>
      </label>
      {accept.isError && <ErrorText>{(accept.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
