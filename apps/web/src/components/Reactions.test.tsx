import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactionKind } from '@uofthub/types'
import Reactions from './Reactions'
import type { Reactions as ReactionsData } from '../lib/api'

const reactions = vi.fn()
const react = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    projects: {
      reactions: (id: string) => reactions(id),
      react: (id: string, kind: ReactionKind) => react(id, kind),
    },
  },
}))

const data = (overrides: Partial<ReactionsData> = {}): ReactionsData => ({
  counts: { USEFUL: 0, IMPRESSIVE: 0, WELL_DOCUMENTED: 0, WOULD_USE: 0 },
  mine: [],
  ...overrides,
})

function show(response: ReactionsData, canReact = true) {
  reactions.mockResolvedValue(response)
  // Retries would turn a deliberate failure into a four-second test.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Reactions projectId="p1" canReact={canReact} />
      </MemoryRouter>
    </QueryClientProvider>
  ).container
}

beforeEach(() => {
  reactions.mockReset()
  react.mockReset()
})

describe('Reactions', () => {
  it('offers every kind to a signed-in reader, even the ones nobody chose', async () => {
    show(data())
    await screen.findByText('Useful')
    expect(screen.getByText('Impressive')).toBeInTheDocument()
    expect(screen.getByText('Well documented')).toBeInTheDocument()
    expect(screen.getByText('Would use this')).toBeInTheDocument()
  })

  it('shows a signed-out reader only what people actually said', async () => {
    // A row of chips they cannot press is clutter; a row of chips they cannot
    // press that are all at zero is worse.
    show(data({ counts: { USEFUL: 3, IMPRESSIVE: 0, WELL_DOCUMENTED: 0, WOULD_USE: 0 } }), false)

    await screen.findByText('Useful')
    expect(screen.queryByText('Impressive')).not.toBeInTheDocument()
  })

  it('renders nothing at all to a signed-out reader when nobody has reacted', async () => {
    const container = show(data(), false)
    await waitFor(() => expect(reactions).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('reads the tally back as a sentence rather than a score', async () => {
    show(data({ counts: { USEFUL: 4, IMPRESSIVE: 0, WELL_DOCUMENTED: 2, WOULD_USE: 0 } }))
    expect(await screen.findByText('4 found this useful · 2 found it well documented')).toBeInTheDocument()
  })

  it('says nothing back when nobody has reacted yet', async () => {
    const container = show(data())
    await screen.findByText('Useful')
    expect(container).not.toHaveTextContent('found this useful')
  })

  it('toggles the reaction the reader pressed', async () => {
    react.mockResolvedValue({ kind: 'USEFUL', reacted: true })
    show(data())

    const chip = await screen.findByText('Useful')
    chip.click()

    await waitFor(() => expect(react).toHaveBeenCalledWith('p1', 'USEFUL'))
  })

  it('does not let a signed-out reader press anything', async () => {
    show(data({ counts: { USEFUL: 1, IMPRESSIVE: 0, WELL_DOCUMENTED: 0, WOULD_USE: 0 } }), false)

    const chip = await screen.findByText('Useful')
    chip.click()

    await waitFor(() => expect(reactions).toHaveBeenCalled())
    expect(react).not.toHaveBeenCalled()
  })

  it('prompts a signed-out reader to sign in', async () => {
    show(data({ counts: { USEFUL: 1, IMPRESSIVE: 0, WELL_DOCUMENTED: 0, WOULD_USE: 0 } }), false)
    expect(await screen.findByText('Sign in')).toHaveAttribute('href', '/session')
  })

  it('marks the reader’s own choices apart from everyone else’s', async () => {
    const container = show(data({ counts: { USEFUL: 1, IMPRESSIVE: 1, WELL_DOCUMENTED: 0, WOULD_USE: 0 }, mine: ['USEFUL'] }))

    await screen.findByText('Useful')
    const chips = [...container.querySelectorAll('.v-chip')] as HTMLElement[]
    const chosen = chips.find(c => c.textContent?.startsWith('Useful'))!
    const other = chips.find(c => c.textContent?.startsWith('Impressive'))!

    // The chosen one is filled with its palette colour; the rest are tinted.
    expect(chosen.style.color).toBe('rgb(255, 255, 255)')
    expect(other.style.color).not.toBe('rgb(255, 255, 255)')
  })
})
