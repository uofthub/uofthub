import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthCtx } from '../../lib/auth'
import type { MeUser } from '../../lib/api'
import { ThemeProvider } from '../../lib/ThemeProvider'
import { MobileHeader } from './MobileChrome'

// They fetch; what matters here is what sits beside them.
vi.mock('./MessagesButton', () => ({ MessagesButton: () => null }))
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))

const user = { id: 'u1', name: 'Ada', email: 'ada@mail.utoronto.ca', handle: 'ada' } as MeUser

const show = (signedIn: boolean) =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthContext.Provider
          value={
            {
              user: signedIn ? user : null,
              loading: false,
              maybeSignedIn: signedIn,
              logout: vi.fn(),
              refetch: vi.fn(),
            } satisfies AuthCtx
          }
        >
          <MobileHeader />
        </AuthContext.Provider>
      </ThemeProvider>
    </MemoryRouter>
  )

describe('MobileHeader', () => {
  it('gives a signed-in phone a way to sign out', () => {
    show(true)
    fireEvent.click(screen.getByRole('button', { name: 'Your account' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByText('Sign out')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('offers sign-in, not an account menu, to a visitor', () => {
    show(false)
    expect(screen.queryByRole('button', { name: 'Your account' })).toBeNull()
    expect(screen.getByText('Sign in')).toBeTruthy()
  })
})
