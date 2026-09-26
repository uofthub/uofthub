import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { api, type ProjectDetail, type ProjectSummary } from '../../lib/api'
import { Contents, Overview, ProjectSections, References } from './Content'

const project = (overrides: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  ownerId: 'owner-1',
  title: 'Ferry times',
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
  canEdit: false,
  ...overrides,
})

const page = (p: ProjectDetail) =>
  render(
    <>
      <Overview project={p} />
      <ProjectSections project={p} />
      <Contents project={p} />
    </>
  ).container

describe('a project’s content', () => {
  it('renders nothing at all for a project with only a title', () => {
    expect(page(project()).textContent).toBe('')
  })

  it('renders no heading for an empty overview or an empty section', () => {
    const c = page(
      project({
        description: '   ',
        sections: [
          { id: 'a', kind: 'results', title: 'Results', body: ' ' },
          { id: 'b', kind: 'examples', items: [{ label: '', body: '' }] },
        ],
      })
    )
    expect(c.querySelector('h2')).toBeNull()
  })

  it('heads each section by the project’s type, in the author’s order', () => {
    page(
      project({
        type: 'RESEARCH',
        sections: [
          { id: 'm', kind: 'method', body: 'Transects at nine sites.' },
          { id: 'r', kind: 'results', body: 'Fewer mussels downstream.' },
        ],
      })
    )
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Methodology', 'Findings', 'Contents'])
  })

  it('shows each approach under its own name', () => {
    page(
      project({
        sections: [
          {
            id: 'a',
            kind: 'approaches',
            title: 'Approaches',
            items: [
              { label: 'Human baseline', body: '71% accurate.' },
              { label: 'LLM prompting', body: '64% accurate.' },
            ],
          },
        ],
      })
    )
    expect(screen.getByRole('heading', { name: 'Human baseline' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'LLM prompting' })).toBeTruthy()
  })

  it('lists only what rendered in the contents, and skips it for a single entry', () => {
    const c = page(
      project({
        description: 'What it is.',
        sections: [
          { id: 'why', kind: 'motivation', body: 'Commuters miss the ferry.' },
          { id: 'none', kind: 'results', body: '' },
        ],
      })
    )
    const links = [...c.querySelectorAll('nav a')].map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ])
    expect(links).toEqual([
      ['Overview', '#overview'],
      ['Motivation', '#section-why'],
    ])

    const single = page(project({ description: 'Only an overview.' }))
    expect(single.querySelector('nav')).toBeNull()
  })
})

describe('a project’s references', () => {
  const withQueries = (p: ProjectDetail) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <References project={p} />
          <Contents project={p} />
        </MemoryRouter>
      </QueryClientProvider>
    ).container

  it('renders nothing without any', () => {
    expect(withQueries(project()).textContent).toBe('')
  })

  it('links each to its source and names who else used it', async () => {
    const other = { ...project(), id: 'p2', title: 'Bike lanes study' } as ProjectSummary
    const shared = vi.spyOn(api.projects, 'sharedReferences').mockResolvedValue([
      {
        reference: { id: 'r1', key: 'doi:10.1000/census', title: 'Census', kind: 'DATASET' },
        projects: [other],
      },
    ])
    const c = withQueries(
      project({
        description: 'What it is.',
        references: [
          {
            id: 'r1',
            kind: 'DATASET',
            title: 'Census',
            doi: '10.1000/census',
            key: 'doi:10.1000/census',
            year: 2021,
          },
          { id: 'r2', kind: 'PAPER', title: 'Unlinked note', key: null },
        ],
      })
    )
    expect(screen.getByRole('link', { name: 'Census' }).getAttribute('href')).toBe(
      'https://doi.org/10.1000/census'
    )
    expect(await screen.findByText('Also used in')).toBeTruthy()
    expect(screen.getByText('Bike lanes study')).toBeTruthy()
    expect(shared).toHaveBeenCalledWith('p1')
    // The title with no link stays text, never an empty href.
    expect(screen.queryByRole('link', { name: 'Unlinked note' })).toBeNull()
    const contents = [...c.querySelectorAll('nav a')].map((a) => a.textContent)
    expect(contents).toEqual(['Overview', 'References'])
  })
})
