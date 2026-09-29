import { describe, expect, it } from 'vitest'
import { MAX_SKIP, pageSkip, pageTake } from './paging.js'

describe('paging', () => {
  it('turns anything into a skip Prisma and Postgres can live with', () => {
    expect(pageSkip(undefined)).toBe(0)
    expect(pageSkip('40')).toBe(40)
    expect(pageSkip('-5')).toBe(0)
    expect(pageSkip('Infinity')).toBe(0)
    expect(pageSkip('1e308')).toBe(MAX_SKIP)
    expect(pageSkip('2.7')).toBe(2)
    expect(pageSkip(['1', '2'])).toBe(0)
  })

  it('keeps take whole and within bounds', () => {
    expect(pageTake(undefined, 20, 50)).toBe(20)
    expect(pageTake('2.5', 20, 50)).toBe(2)
    expect(pageTake('999', 20, 50)).toBe(50)
    expect(pageTake('-3', 20, 50)).toBe(1)
    expect(pageTake('NaN', 20, 50)).toBe(20)
  })
})
