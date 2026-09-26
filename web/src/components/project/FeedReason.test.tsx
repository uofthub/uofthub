import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { FeedReason as Reason } from '../../lib/api'
import { reasonToShow } from '../../lib/feedReason'
import { FeedReason } from './FeedReason'

const following: Reason = { kind: 'FOLLOWING', userId: 'u1', userName: 'Priya Nair' }
const course: Reason = { kind: 'COURSE', tag: 'CSC343' }
const campus: Reason = { kind: 'CAMPUS', campus: 'UTSG' }
const trending: Reason = { kind: 'TRENDING' }

describe('reasonToShow', () => {
  it('drops a reason the tab already implies', () => {
    expect(reasonToShow(following, 'following')).toBeNull()
    expect(reasonToShow(campus, 'campus')).toBeNull()
  })

  it('keeps a reason that adds something to the tab', () => {
    expect(reasonToShow(following, 'campus')).toBe(following)
    expect(reasonToShow(course, 'following')).toBe(course)
    expect(reasonToShow(campus, 'program')).toBe(campus)
  })

  it('shows trending only on the blended feed, where it is true', () => {
    expect(reasonToShow(trending, 'program')).toBeNull()
    expect(reasonToShow(trending, 'all')).toBe(trending)
    expect(reasonToShow(undefined, 'all')).toBeNull()
  })
})

describe('FeedReason', () => {
  it('links the person followed and the course', () => {
    render(
      <MemoryRouter>
        <FeedReason reason={following} />
        <FeedReason reason={course} />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: 'Priya Nair' }).getAttribute('href')).toBe('/u/u1')
    expect(screen.getByRole('link', { name: 'CSC343' }).getAttribute('href')).toBe(
      '/explore?course=CSC343'
    )
  })
})
