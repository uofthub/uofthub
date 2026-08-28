import { describe, expect, it } from 'vitest'
import { isReportable } from './monitoring.js'

describe('isReportable', () => {
  it('reports server failures', () => {
    expect(isReportable(500)).toBe(true)
    expect(isReportable(502)).toBe(true)
    // A thrown error that never reached a reply has no status yet.
    expect(isReportable(0)).toBe(true)
  })

  it('ignores the 4xx responses that mean the API is working', () => {
    // Every one of these is a rule doing its job: an expired session, a
    // private project hidden behind a 404, a bad payload, a rate limit.
    for (const status of [400, 401, 403, 404, 409, 410, 413, 429]) {
      expect(isReportable(status)).toBe(false)
    }
  })

  it('ignores successes and redirects', () => {
    expect(isReportable(200)).toBe(false)
    expect(isReportable(302)).toBe(false)
  })
})
