import { describe, expect, it } from 'vitest'
import { startOfTorontoDay } from './dates.js'

describe('startOfTorontoDay', () => {
  it('is midnight Toronto time, five hours behind UTC in winter', () => {
    expect(startOfTorontoDay('2026-12-20')?.toISOString()).toBe('2026-12-20T05:00:00.000Z')
  })

  it('is four hours behind UTC in summer', () => {
    expect(startOfTorontoDay('2026-07-01')?.toISOString()).toBe('2026-07-01T04:00:00.000Z')
  })

  it('follows the clock change on the day it happens', () => {
    // Clocks go forward at 2am on 8 March 2026; midnight is still EST.
    expect(startOfTorontoDay('2026-03-08')?.toISOString()).toBe('2026-03-08T05:00:00.000Z')
    // And back at 2am on 1 November; midnight is still EDT.
    expect(startOfTorontoDay('2026-11-01')?.toISOString()).toBe('2026-11-01T04:00:00.000Z')
  })

  it('refuses anything that is not a calendar date', () => {
    expect(startOfTorontoDay('2026-02-30')).toBeNull()
    expect(startOfTorontoDay('20-12-2026')).toBeNull()
    expect(startOfTorontoDay('2026-12-20T00:00:00Z')).toBeNull()
    expect(startOfTorontoDay('')).toBeNull()
  })
})
