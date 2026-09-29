import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ProjectSummary } from '../../lib/api'
import { ProjectCard, ProjectListRow } from './ProjectCard'
import { COVER_PALETTES, coverPalette } from './palette'

const project = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: '11111111-2222-3333-4444-555555555555',
  ownerId: 'owner-1',
  title: 'Seatfinder',
  slug: 'seatfinder',
  pitch: 'Live map of open study seats in Robarts.',
  description: '## What we built\nA floor-by-floor map.',
  tags: [],
  visibility: 'PUBLIC',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  owner: { id: 'owner-1', handle: 'omar-haddad', name: 'Omar Haddad' },
  links: [],
  collaborators: [],
  _count: { comments: 0 },
  reactions: { USEFUL: 0, IMPRESSIVE: 0, COLLAB: 0 },
  reactionTotal: 0,
  myReactions: [],
  saved: false,
  orgProjects: [],
  ...overrides,
})

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me' } }) }))

const wrap = (children: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )

const show = (p: ProjectSummary, row = false) =>
  wrap(row ? <ProjectListRow project={p} /> : <ProjectCard project={p} />).container

describe('ProjectCard', () => {
  it('uses the uploaded cover when there is one', () => {
    const c = show(project({ coverUrl: 'https://storage.example/cover.png?sig=abc' }))
    expect(c.querySelector('img')?.getAttribute('src')).toBe(
      'https://storage.example/cover.png?sig=abc'
    )
    expect(c.querySelector('[data-cover="generated"]')).toBeNull()
  })

  it('draws a cover from the title when there is none', () => {
    const c = show(project())
    expect(c.querySelector('[data-cover="generated"]')).not.toBeNull()
  })

  it('gives a project the same cover on every render', () => {
    expect(coverPalette('abc')).toBe(coverPalette('abc'))
  })

  it('spreads projects across the palette rather than painting them all alike', () => {
    const used = new Set(Array.from({ length: 40 }, (_, i) => coverPalette(`project-${i}`)))
    expect(used.size).toBeGreaterThan(COVER_PALETTES.length / 2)
  })

  it('shows the pitch, not the story', () => {
    show(project())
    expect(screen.getByText('Live map of open study seats in Robarts.')).toBeInTheDocument()
    expect(screen.queryByText(/floor-by-floor/)).not.toBeInTheDocument()
  })

  it('files a project under its course', () => {
    show(project({ courseCode: 'CSC309', tags: ['React'] }))
    expect(screen.getByText('Made for CSC309')).toBeInTheDocument()
  })

  it('does not take a course from the tags', () => {
    show(project({ tags: ['React', 'csc309'] }))
    expect(screen.queryByText(/Made for/)).not.toBeInTheDocument()
  })

  it('reacts from the card, with the counts on the buttons', () => {
    show(project({ reactions: { USEFUL: 2, IMPRESSIVE: 5, COLLAB: 0 }, myReactions: ['USEFUL'] }))
    const pressed = screen.getAllByRole('button', { pressed: true })
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toHaveAccessibleName(/, 2$/)
  })

  it('opens the comments from the comment count, on the card and the row', () => {
    for (const row of [false, true]) {
      const c = show(project({ _count: { comments: 9 } }), row)
      expect(c.querySelector('a[aria-label="9 comments"]')).toHaveAttribute(
        'href',
        '/@omar-haddad/seatfinder#comments'
      )
    }
  })

  it('links the owner to their profile', () => {
    show(project())
    expect(screen.getByRole('link', { name: 'Omar' })).toHaveAttribute('href', '/@omar-haddad')
  })

  it('shows the type badge and where the project stands', () => {
    show(project({ type: 'APP', status: 'SHIPPED' }))
    expect(screen.getByText('App')).toBeInTheDocument()
    expect(screen.getByText('Finished')).toBeInTheDocument()
  })

  it('says which group it was built with when it has no course', () => {
    show(
      project({ orgProjects: [{ org: { slug: 'robotics', name: 'UofT Robotics', type: 'CLUB' } }] })
    )
    expect(screen.getByRole('link', { name: 'Built with UofT Robotics' })).toHaveAttribute(
      'href',
      '/orgs/robotics'
    )
  })

  it('prefers the course when it has both', () => {
    show(
      project({
        courseCode: 'CSC309',
        orgProjects: [{ org: { slug: 'r', name: 'UofT Robotics', type: 'CLUB' } }],
      })
    )
    expect(screen.getByText('Made for CSC309')).toBeInTheDocument()
    expect(screen.queryByText('Built with UofT Robotics')).not.toBeInTheDocument()
  })

  it('credits collaborators beside the owner', () => {
    show(project({ collaborators: [{ user: { id: 'u2', name: 'Maya Chen' } }] }))
    expect(screen.getByRole('link', { name: 'Omar' })).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('marks a draft and a link-only project so their owner can tell', () => {
    show(project({ visibility: 'PRIVATE' }))
    expect(screen.getByText('Draft')).toBeInTheDocument()
    show(project({ visibility: 'UNLISTED' }))
    expect(screen.getByText('Unlisted')).toBeInTheDocument()
  })

  it('never nests an anchor inside another', () => {
    for (const c of [show(project()), show(project(), true)]) {
      expect(c.querySelector('a a')).toBeNull()
    }
  })

  it('links the title to the project', () => {
    show(project())
    expect(screen.getByRole('link', { name: 'Seatfinder' })).toHaveAttribute(
      'href',
      '/@omar-haddad/seatfinder'
    )
  })

  it('credits the profile owner when the payload carries no owner', () => {
    wrap(
      <ProjectCard
        project={project({ owner: undefined })}
        maker={{ id: 'm1', name: 'Maya Chen' }}
      />
    )
    expect(screen.getByRole('link', { name: 'Maya' })).toHaveAttribute('href', '/u/m1')
  })
})
