import { describe, expect, it } from 'vitest'
import { ORG_TERM_ALLOWANCE_BYTES, termFor, termLabel, termStart, termsSince } from './terms.js'

const utc = (y: number, m: number, d = 15) => new Date(Date.UTC(y, m, d))

describe('termFor', () => {
  it('splits the calendar into Winter, Summer and Fall', () => {
    expect(termFor(utc(2026, 0))).toBe('2026W') // January
    expect(termFor(utc(2026, 3))).toBe('2026W') // April
    expect(termFor(utc(2026, 4))).toBe('2026S') // May
    expect(termFor(utc(2026, 7))).toBe('2026S') // August
    expect(termFor(utc(2026, 8))).toBe('2026F') // September
    expect(termFor(utc(2026, 11))).toBe('2026F') // December
  })

  it('keeps a Fall term in its own calendar year', () => {
    // The Fall term spans the new year academically, but the key is the year
    // it starts in — grants are per calendar-anchored term, not per session.
    expect(termFor(utc(2025, 11, 31))).toBe('2025F')
    expect(termFor(utc(2026, 0, 1))).toBe('2026W')
  })
})

describe('termStart', () => {
  it('round-trips with termFor', () => {
    for (const key of ['2025F', '2026W', '2026S']) {
      expect(termFor(termStart(key))).toBe(key)
    }
  })
})

describe('termsSince', () => {
  it('returns just the current term when nothing has elapsed', () => {
    expect(termsSince(utc(2026, 8, 1), utc(2026, 10, 1))).toEqual(['2026F'])
  })

  it('stacks every term between verification and now', () => {
    // A group verified in December 2025 is owed Fall 2025, Winter and Summer
    // 2026 — this is what makes a missed grant run catch up on the next one.
    expect(termsSince(utc(2025, 11, 10), utc(2026, 6, 1))).toEqual(['2025F', '2026W', '2026S'])
  })

  it('crosses year boundaries', () => {
    expect(termsSince(utc(2025, 8, 1), utc(2026, 0, 15))).toEqual(['2025F', '2026W'])
  })

  it('never runs away on an absurd start date', () => {
    expect(termsSince(new Date(0), utc(2026, 0)).length).toBeLessThanOrEqual(400)
  })
})

describe('the allowance', () => {
  it('is 10GB', () => {
    expect(ORG_TERM_ALLOWANCE_BYTES).toBe(10 * 1024 ** 3)
  })
})

describe('termLabel', () => {
  it('reads as a human would say it', () => {
    expect(termLabel('2026F')).toBe('Fall 2026')
    expect(termLabel('2026W')).toBe('Winter 2026')
    expect(termLabel('2026S')).toBe('Summer 2026')
  })
})
