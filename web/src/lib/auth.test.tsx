import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth'

const me = vi.fn()
const logout = vi.fn()

vi.mock('./api', () => ({
  api: {
    auth: {
      me: () => me(),
      logout: () => logout(),
    },
  },
}))

/**
 * `maybeSignedIn` is a guess this browser makes about itself so `/` does not
 * flash the marketing page at its own user. The rule that makes it safe is
 * that it is only ever a guess *while the real answer is outstanding* — the
 * moment `/auth/me` replies, the reply wins.
 */
function Probe() {
  const { user, loading, maybeSignedIn, logout } = useAuth()
  return (
    <div>
      <span data-testid="maybe">{String(maybeSignedIn)}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.name : 'none'}</span>
      <button onClick={() => logout()}>Sign out</button>
    </div>
  )
}

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>
  )

const maybe = () => screen.getByTestId('maybe').textContent
const settled = () =>
  waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

beforeEach(() => {
  me.mockReset()
  logout.mockReset()
  localStorage.clear()
})

describe('maybeSignedIn', () => {
  it('guesses no for a browser that has never signed in', () => {
    // A first-time visitor gets the marketing page immediately rather than
    // waiting a round trip to be told what they already are.
    me.mockReturnValue(new Promise(() => {}))
    show()
    expect(maybe()).toBe('false')
  })

  it('guesses yes for a browser that was signed in last time', () => {
    localStorage.setItem('signed-in', 'true')
    me.mockReturnValue(new Promise(() => {}))
    show()
    expect(maybe()).toBe('true')
  })

  it('stops guessing the moment the session is confirmed gone', async () => {
    // The dangerous case: a stale hint must not survive a failed check.
    localStorage.setItem('signed-in', 'true')
    me.mockRejectedValue(new Error('Unauthorized'))

    show()
    expect(maybe()).toBe('true')

    await settled()
    expect(maybe()).toBe('false')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('clears the stored hint when the check fails, so the next visit does not guess again', async () => {
    localStorage.setItem('signed-in', 'true')
    me.mockRejectedValue(new Error('Unauthorized'))

    show()
    await settled()

    expect(localStorage.getItem('signed-in')).toBe('false')
  })

  it('records the hint once a session is confirmed', async () => {
    me.mockResolvedValue({ id: 'u1', name: 'Ada' })

    show()
    await settled()

    expect(maybe()).toBe('true')
    expect(screen.getByTestId('user')).toHaveTextContent('Ada')
    expect(localStorage.getItem('signed-in')).toBe('true')
  })

  it('stays true while a signed-in session is being rechecked', async () => {
    // refetch() sets loading again; the answer is already known and must not
    // be thrown away mid-flight.
    me.mockResolvedValue({ id: 'u1', name: 'Ada' })
    show()
    await settled()
    expect(maybe()).toBe('true')
  })

  it('forgets the browser on sign-out', async () => {
    // Otherwise the next visit opens a spinner and then drops the reader on
    // the marketing page, having guessed at a session they deliberately ended.
    me.mockResolvedValue({ id: 'u1', name: 'Ada' })
    logout.mockResolvedValue({ ok: true })

    show()
    await settled()
    expect(maybe()).toBe('true')

    screen.getByText('Sign out').click()

    await waitFor(() => expect(maybe()).toBe('false'))
    expect(localStorage.getItem('signed-in')).toBe('false')
  })

  it('does not guess yes for a browser whose hint says no', async () => {
    localStorage.setItem('signed-in', 'false')
    me.mockReturnValue(new Promise(() => {}))
    show()
    expect(maybe()).toBe('false')
  })
})
