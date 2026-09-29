import { describe, expect, it } from 'vitest'
import { isUofTEmail } from './uoftEmail.js'

describe('isUofTEmail', () => {
  it('accepts student and staff addresses', () => {
    for (const ok of [
      'first.last@mail.utoronto.ca',
      'a@mail.utoronto.ca',
      'prof.name@utoronto.ca',
      "o'brien.k@mail.utoronto.ca",
      'first-last2@utoronto.ca',
      'a@sub.utoronto.ca',
      'prof@ece.utoronto.ca',
      'grad@cs.toronto.edu',
      'a@math.toronto.edu',
      'a@stats.toronto.edu',
      'a@toronto.edu',
      'a@math.utoronto.ca',
    ])
      expect(isUofTEmail(ok), ok).toBe(true)
  })

  it('refuses anything that is not exactly one U of T address', () => {
    for (const bad of [
      'a@gmail.com,b@mail.utoronto.ca',
      'a@gmail.com, b@mail.utoronto.ca',
      '"a@gmail.com"@mail.utoronto.ca',
      'a b@mail.utoronto.ca',
      'a@mail.utoronto.ca\n',
      'x\nbcc: a@gmail.com@mail.utoronto.ca',
      '<a@gmail.com>@mail.utoronto.ca',
      'a@gmail.com;b@utoronto.ca',
      'a@evilutoronto.ca',
      'a@eviltoronto.edu',
      'a@toronto.edu.evil.com',
      'a@cs.toronto.edu.evil.com',
      'a@toronto.com',
      'a@-x.utoronto.ca',
      'a@x..utoronto.ca',
      '@mail.utoronto.ca',
      '.a@mail.utoronto.ca',
      'a.@mail.utoronto.ca',
      `${'a'.repeat(65)}@mail.utoronto.ca`,
      'a@mail.utoronto.ca.evil.com',
    ])
      expect(isUofTEmail(bad), JSON.stringify(bad)).toBe(false)
  })
})
