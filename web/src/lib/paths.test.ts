import { describe, expect, it } from 'vitest'
import { handleOf, profilePath, projectPath } from './paths'

describe('addresses', () => {
  it('are readable when the handle and slug are to hand', () => {
    expect(profilePath({ id: 'u1', handle: 'ada' })).toBe('/@ada')
    expect(projectPath({ id: 'p1', slug: 'robot-arm', owner: { handle: 'ada' } })).toBe(
      '/@ada/robot-arm'
    )
  })

  it('fall back to the id, which redirects, when they are not', () => {
    expect(profilePath({ id: 'u1' })).toBe('/u/u1')
    expect(projectPath({ id: 'p1', slug: 'robot-arm' })).toBe('/projects/p1')
    expect(projectPath({ id: 'p1', owner: { handle: 'ada' } })).toBe('/projects/p1')
  })

  it('read a handle only from a segment that starts with @', () => {
    expect(handleOf('@ada')).toBe('ada')
    expect(handleOf('ada')).toBeNull()
    expect(handleOf('@')).toBeNull()
    expect(handleOf(undefined)).toBeNull()
  })
})
