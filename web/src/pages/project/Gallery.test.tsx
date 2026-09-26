import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api, type ProjectDetail } from '../../lib/api'
import { Gallery } from './Gallery'

const project = (overrides: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  ownerId: 'owner-1',
  title: 'Mussels downstream',
  tags: [],
  visibility: 'PUBLIC',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  links: [],
  collaborators: [],
  files: [],
  references: [],
  outputs: [],
  _count: { comments: 0 },
  reactions: { USEFUL: 0, IMPRESSIVE: 0, COLLAB: 0 },
  reactionTotal: 0,
  myReactions: [],
  saved: false,
  orgProjects: [],
  ...overrides,
})

const show = (p: ProjectDetail) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Gallery project={p} isOwner={false} />
    </QueryClientProvider>
  ).container

const file = (id: string, name: string) => ({
  id,
  projectId: 'p1',
  name,
  sizeBytes: 1,
  uploadedAt: '2026-08-01T00:00:00.000Z',
})

describe('the gallery', () => {
  it('leads with a primary poster’s thumbnail, which opens the poster', () => {
    vi.spyOn(api.projects, 'filePreview').mockResolvedValue({ kind: 'image', name: 'x', url: 'u' })
    show(
      project({
        files: [file('f1', 'poster.pdf'), file('f2', 'photo.jpg')],
        outputs: [
          { id: 'o1', kind: 'POSTER', fileId: 'f1', primary: true, thumbnailUrl: 'https://s/thumb.webp' },
        ],
      })
    )
    const lead = screen.getByRole('button', { name: 'View poster: Poster' })
    expect(lead.querySelector('img')?.getAttribute('src')).toBe('https://s/thumb.webp')
    // The photo still follows in the strip.
    expect(screen.getByRole('button', { name: 'Show photo.jpg' })).toBeTruthy()
  })

  it('shows the cover when nothing leads and there are no images', () => {
    const c = show(project({ files: [file('f1', 'report.pdf')] }))
    expect(c.querySelector('[data-cover="generated"]')).not.toBeNull()
  })

  it('does not lead with a primary output that has no thumbnail yet', () => {
    const c = show(
      project({
        files: [file('f1', 'poster.pdf')],
        outputs: [{ id: 'o1', kind: 'POSTER', fileId: 'f1', primary: true }],
      })
    )
    expect(screen.queryByRole('button', { name: /View poster/ })).toBeNull()
    expect(c.querySelector('[data-cover="generated"]')).not.toBeNull()
  })
})
