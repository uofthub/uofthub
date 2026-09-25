import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ProjectDetail } from '../../lib/api'
import { Contents, Overview, ProjectSections } from './Content'

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
  _count: { comments: 0 },
  reactions: { USEFUL: 0, IMPRESSIVE: 0, COLLAB: 0 },
  reactionTotal: 0,
  myReactions: [],
  saved: false,
  orgProjects: [],
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
    const links = [...c.querySelectorAll('nav a')].map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Overview', '#overview'],
      ['Motivation', '#section-why'],
    ])

    const single = page(project({ description: 'Only an overview.' }))
    expect(single.querySelector('nav')).toBeNull()
  })
})
