import { describe, expect, it } from 'vitest'
import {
  courseOf,
  isCourseCode,
  linkRole,
  primaryAction,
  safeLinks,
  timeAgo,
  timeShort,
  topicTags,
} from './projectView'

const link = (label: string, url: string) => ({ id: label, projectId: 'p', label, url })

describe('courses', () => {
  it.each(['CSC309', 'csc309', 'MAT102', 'CSC309H1', 'ENG100Y5'])(
    'reads %s as a course code',
    (code) => {
      expect(isCourseCode(code)).toBe(true)
    }
  )
  it.each(['React', 'CS309', 'CSC30', 'hackathon'])('does not read %s as one', (tag) => {
    expect(isCourseCode(tag)).toBe(false)
  })
  it('takes the first course tag, normalised, and leaves the rest as topics', () => {
    expect(courseOf(['React', 'csc309', 'MAT102'])).toBe('CSC309')
    expect(topicTags(['React', 'csc309'])).toEqual(['React'])
  })
})

describe('links', () => {
  it('knows code, video and audio hosts whatever the label says', () => {
    expect(linkRole(link('Site', 'https://github.com/a/b'))).toBe('code')
    expect(linkRole(link('Link', 'https://youtu.be/x'))).toBe('video')
    expect(linkRole(link('Link', 'https://soundcloud.com/x'))).toBe('audio')
  })
  it('falls back to the label for anything else', () => {
    expect(linkRole(link('Live demo', 'https://seatfinder.app'))).toBe('live')
    expect(linkRole(link('Slides', 'https://example.com'))).toBe('other')
  })
  it('drops javascript: links before anything renders them', () => {
    expect(safeLinks([link('Live', 'javascript:alert(1)')])).toEqual([])
  })
  it('picks the main button from what is linked', () => {
    expect(
      primaryAction(
        safeLinks([link('Code', 'https://github.com/a'), link('Live demo', 'https://x.app')])
      )?.label
    ).toBe('Try it live')
    expect(primaryAction(safeLinks([link('Trailer', 'https://vimeo.com/1')]))?.label).toBe('Watch')
    expect(primaryAction(safeLinks([link('Code', 'https://github.com/a')]))).toBeUndefined()
  })
})

describe('time', () => {
  const now = new Date('2026-09-24T12:00:00Z').getTime()
  const ago = (ms: number) => new Date(now - ms).toISOString()
  it('writes feed times the way the board does', () => {
    expect(timeShort(ago(2 * 3600_000), now)).toBe('2h')
    expect(timeShort(ago(26 * 3600_000), now)).toBe('1d')
  })
  it('writes project-page times in words', () => {
    expect(timeAgo(ago(3 * 86400_000), now)).toBe('3 days ago')
    expect(timeAgo(ago(15 * 86400_000), now)).toBe('2 weeks ago')
    expect(timeAgo(ago(40 * 86400_000), now)).toBe('1 month ago')
  })
})
