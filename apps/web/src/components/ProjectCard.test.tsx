import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProjectCard, { ProjectRow } from './ProjectCard'
import type { ProjectSummary } from '../lib/api'

const project = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: '11111111-2222-3333-4444-555555555555',
  ownerId: 'owner-1',
  title: 'Autonomous gripper',
  tags: [],
  visibility: 'PUBLIC',
  viewCount: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  owner: { id: 'owner-1', name: 'Ada Lovelace' },
  _count: { likes: 0, comments: 0 },
  ...overrides,
})

const show = (p: ProjectSummary) =>
  render(
    <MemoryRouter>
      <ProjectCard project={p} />
    </MemoryRouter>
  ).container

describe('ProjectCard', () => {
  it('uses the cover image when the project has one', () => {
    const c = show(project({ coverUrl: 'https://storage.example/cover.png?sig=abc' }))
    expect(c.querySelector('img')).toHaveAttribute('src', 'https://storage.example/cover.png?sig=abc')
  })

  it('falls back to a monogram of the title when there is no cover', () => {
    const c = show(project({ title: 'Zebra crossing study' }))
    expect(c.querySelector('img')).not.toBeInTheDocument()
    expect(c).toHaveTextContent('Z')
  })

  it('gives the same project the same fallback colour every render', () => {
    const tone = () => (show(project()).querySelector('[aria-hidden="true"]') as HTMLElement).style.background
    expect(tone()).toBe(tone())
  })

  it('spreads projects across the palette rather than painting them all alike', () => {
    // Any two ids may legitimately collide across eight tones, so this asserts
    // the distribution instead of picking on a pair.
    const tones = new Set(
      Array.from({ length: 40 }, (_, i) => {
        const id = `${i}0000000-0000-0000-0000-00000000000${i % 10}`
        return (show(project({ id })).querySelector('[aria-hidden="true"]') as HTMLElement).style.background
      })
    )
    expect(tones.size).toBeGreaterThan(3)
  })

  it('hides zero counts instead of printing a row of noughts', () => {
    // Asserted on the icons, not the text: the formatted date legitimately
    // contains a "0".
    const c = show(project({ _count: { likes: 0, comments: 0 }, viewCount: 0 }))
    expect(c.querySelector('.mdi-heart-outline')).not.toBeInTheDocument()
    expect(c.querySelector('.mdi-comment-outline')).not.toBeInTheDocument()
    expect(c.querySelector('.mdi-eye-outline')).not.toBeInTheDocument()
  })

  it('shows counts once they are non-zero, and only those', () => {
    const c = show(project({ _count: { likes: 3, comments: 0 }, viewCount: 12 }))
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(c.querySelector('.mdi-comment-outline')).not.toBeInTheDocument()
  })

  it('shows the owner campus as its short code', () => {
    show(project({ owner: { id: 'owner-1', name: 'Ada', campus: 'UTM' } }))
    expect(screen.getByText('UTM')).toBeInTheDocument()
    expect(screen.getByTitle('Mississauga')).toBeInTheDocument()
  })

  it('says nothing about campus when the owner has not set one', () => {
    const c = show(project())
    expect(c).not.toHaveTextContent('UTM')
    expect(c).not.toHaveTextContent('UTSG')
  })

  it('caps visible tags and counts the rest', () => {
    show(project({ tags: ['a', 'b', 'c', 'd', 'e'] }))
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByText('d')).not.toBeInTheDocument()
  })

  it('never nests an anchor inside the card anchor', () => {
    // The whole card is a link; a link inside it makes the browser close the
    // outer one, silently breaking the card's click target.
    const c = show(project({ owner: { id: 'owner-1', name: 'Ada', campus: 'UTSC' } }))
    const outer = c.querySelector('a')!
    expect(outer.querySelector('a')).toBeNull()
  })

  it('links to the project', () => {
    const c = show(project())
    expect(c.querySelector('a')).toHaveAttribute(
      'href',
      '/projects/11111111-2222-3333-4444-555555555555'
    )
  })
})

describe('ProjectRow', () => {
  const row = (p: ProjectSummary) =>
    render(
      <MemoryRouter>
        <ProjectRow project={p} />
      </MemoryRouter>
    ).container

  it('renders the same project as a single row without nesting anchors', () => {
    const c = row(project({ description: 'A gripper.', tags: ['CSC309'] }))

    expect(c).toHaveTextContent('Autonomous gripper')
    expect(c).toHaveTextContent('CSC309')
    expect(c.querySelector('a')!.querySelector('a')).toBeNull()
  })

  it('hides the owner when asked to, for a feed that already named them', () => {
    const c = render(
      <MemoryRouter>
        <ProjectRow project={project()} showOwner={false} />
      </MemoryRouter>
    ).container
    expect(c).not.toHaveTextContent('Ada Lovelace')
  })
})

describe('the date a project is stamped with', () => {
  // A capstone drafted in January and opened up in March is March's news, so
  // both the card and the row date it by when it was published — createdAt is
  // only the fallback for a project published before the column existed.
  const january = '2026-01-05T00:00:00.000Z'
  const march = '2026-03-20T00:00:00.000Z'

  const dateShownBy = (node: HTMLElement) => node.textContent ?? ''

  it('prefers publishedAt on the card', () => {
    const c = show(project({ createdAt: january, publishedAt: march }))
    expect(dateShownBy(c)).toContain(new Date(march).toLocaleDateString())
    expect(dateShownBy(c)).not.toContain(new Date(january).toLocaleDateString())
  })

  it('prefers publishedAt on the row', () => {
    const c = render(
      <MemoryRouter>
        <ProjectRow project={project({ createdAt: january, publishedAt: march })} />
      </MemoryRouter>
    ).container
    expect(dateShownBy(c)).toContain(new Date(march).toLocaleDateString())
  })

  it('falls back to createdAt for a project that predates the column', () => {
    const c = show(project({ createdAt: january }))
    expect(dateShownBy(c)).toContain(new Date(january).toLocaleDateString())
  })
})
