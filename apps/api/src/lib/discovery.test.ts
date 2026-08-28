import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_MODEL, discoveryModel, windowStart } from './discovery.js'

const now = new Date(Date.UTC(2026, 7, 28))

describe('discoveryModel', () => {
  afterEach(() => {
    delete process.env.OPENAI_MODEL
  })

  it('defaults to the model compiled in', () => {
    expect(discoveryModel()).toBe(DEFAULT_MODEL)
    expect(DEFAULT_MODEL).toBe('gpt-5.6-luna')
  })

  it('lets the environment override it', () => {
    process.env.OPENAI_MODEL = 'gpt-5.6-mini'
    expect(discoveryModel()).toBe('gpt-5.6-mini')
  })

  it('ignores a blank or whitespace override rather than sending an empty model', () => {
    process.env.OPENAI_MODEL = '   '
    expect(discoveryModel()).toBe(DEFAULT_MODEL)
  })
})

describe('windowStart', () => {
  it('is null when the query bounds no time window', () => {
    expect(windowStart(null, now)).toBeNull()
  })

  it('walks back the right distance for each window', () => {
    expect(windowStart('month', now)?.toISOString().slice(0, 10)).toBe('2026-07-28')
    // A term is four months — the shape of the academic calendar without
    // pretending to line up with its exact boundaries.
    expect(windowStart('term', now)?.toISOString().slice(0, 10)).toBe('2026-04-28')
    expect(windowStart('year', now)?.toISOString().slice(0, 10)).toBe('2025-08-28')
  })

  it('crosses a year boundary correctly', () => {
    const january = new Date(Date.UTC(2026, 0, 15))
    expect(windowStart('term', january)?.toISOString().slice(0, 10)).toBe('2025-09-15')
  })
})
