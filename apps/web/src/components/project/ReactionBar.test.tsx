import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactionKind } from '@uofthub/types'
import { ReactionBar } from './ReactionBar'

const react = vi.fn()
const navigate = vi.fn()
let signedIn = true

vi.mock('../../lib/api', () => ({
  api: { projects: { react: (id: string, kind: ReactionKind) => react(id, kind) } },
}))
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: signedIn ? { id: 'me', name: 'Me' } : null }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

const project = (
  counts: Partial<Record<ReactionKind, number>> = {},
  mine: ReactionKind[] = []
) => ({
  id: 'p1',
  reactions: { USEFUL: 0, IMPRESSIVE: 0, COLLAB: 0, ...counts },
  myReactions: mine,
  _count: { comments: 9 },
})

function show(p: ReturnType<typeof project>, compact = false) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReactionBar project={p} compact={compact} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  signedIn = true
  react.mockReset().mockResolvedValue({ reacted: true })
  navigate.mockReset()
})

describe('ReactionBar', () => {
  it('offers the design’s three reactions and the comment count, without fetching anything', () => {
    show(project())
    expect(screen.getByText('Impressive')).toBeInTheDocument()
    expect(screen.getByText('Want to collab')).toBeInTheDocument()
    expect(screen.getByText('Learned something')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '9 comments' })).toHaveAttribute(
      'href',
      '/projects/p1#comments'
    )
    expect(react).not.toHaveBeenCalled()
  })

  it('reads the counts off the project it is handed', () => {
    show(project({ USEFUL: 12, IMPRESSIVE: 48, COLLAB: 6 }))
    expect(screen.getByLabelText('Learned something, 12')).toBeInTheDocument()
    expect(screen.getByLabelText('Impressive, 48')).toBeInTheDocument()
    expect(screen.getByLabelText('Want to collab, 6')).toBeInTheDocument()
  })

  it('lets a reader offer to collaborate', async () => {
    show(project())
    fireEvent.click(screen.getByLabelText('Want to collab, 0'))
    await waitFor(() => expect(react).toHaveBeenCalledWith('p1', 'COLLAB'))
  })

  it('counts a tap at once, before the API answers', () => {
    react.mockReturnValue(new Promise(() => {}))
    show(project({ IMPRESSIVE: 2 }))
    fireEvent.click(screen.getByLabelText('Impressive, 2'))
    expect(screen.getByLabelText('Impressive, 3')).toHaveAttribute('aria-pressed', 'true')
  })

  it('undoes the tap if the API refuses it', async () => {
    react.mockRejectedValue(new Error('nope'))
    show(project({ IMPRESSIVE: 2 }))
    fireEvent.click(screen.getByLabelText('Impressive, 2'))
    expect(await screen.findByLabelText('Impressive, 2')).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the reader’s own choices apart from everyone else’s', () => {
    show(project({ USEFUL: 3, IMPRESSIVE: 1 }, ['USEFUL']))
    expect(screen.getByLabelText('Learned something, 3')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Impressive, 1')).toHaveAttribute('aria-pressed', 'false')
  })

  it('sends a signed-out reader to sign in instead of reacting', () => {
    signedIn = false
    show(project())
    fireEvent.click(screen.getByLabelText('Impressive, 0'))
    expect(react).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/session')
  })

  it('drops the words on a phone and keeps the counts', () => {
    show(project({ IMPRESSIVE: 72 }), true)
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.queryByText('Impressive')).not.toBeInTheDocument()
  })
})
