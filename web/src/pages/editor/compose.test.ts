import { describe, expect, it } from 'vitest'
import { typeForUrl } from './compose'

describe('starting from a link', () => {
  it('guesses the kind of work from where the link lives', () => {
    expect(typeForUrl('https://github.com/o/seatfinder')).toBe('APP')
    expect(typeForUrl('https://youtu.be/abc')).toBe('FILM')
    expect(typeForUrl('https://www.figma.com/file/x')).toBe('DESIGN')
    expect(typeForUrl('https://artist.bandcamp.com/track/y')).toBe('AUDIO')
    expect(typeForUrl('https://example.com')).toBeNull()
    expect(typeForUrl('not a url')).toBeNull()
  })
})
