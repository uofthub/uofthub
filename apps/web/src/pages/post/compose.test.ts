import { describe, expect, it } from 'vitest'
import { composeDescription, composeDetails, composeLinks, placeLinks, typeForUrl } from './compose'

describe('the post form’s answers', () => {
  it('turns URL answers into labelled links the project page understands', () => {
    expect(
      composeLinks('APP', { live: ' https://seatfinder.app ', repo: 'https://github.com/o/s' })
    ).toEqual([
      { label: 'Live demo', url: 'https://seatfinder.app' },
      { label: 'Code', url: 'https://github.com/o/s' },
    ])
  })

  it('skips answers left blank', () => {
    expect(composeLinks('APP', { live: '', repo: '   ' })).toEqual([])
  })

  it('turns short free-text answers into labelled details, in the form’s order', () => {
    const answers = { credits: 'Aisha, Omar', runtime: '6:12', video: 'https://youtu.be/x' }
    expect(composeDetails('FILM', answers)).toEqual([
      { label: 'Runtime', value: '6:12' },
      { label: 'Credits', value: 'Aisha, Omar' },
    ])
    // None of it is written into the overview any more.
    expect(composeDescription('FILM', answers)).toBe('')
  })

  it('makes a research abstract the overview, and the supervisor a detail', () => {
    const answers = { abstract: 'We sampled nine sites.', supervisor: 'Lab X' }
    expect(composeDescription('RESEARCH', answers)).toBe('We sampled nine sites.')
    expect(composeDetails('RESEARCH', answers)).toEqual([
      { label: 'Supervisor or lab', value: 'Lab X' },
    ])
  })

  it('ignores answers from a type the student switched away from', () => {
    expect(composeDescription('APP', { runtime: '6:12' })).toBe('')
    expect(composeDetails('APP', { runtime: '6:12' })).toEqual([])
  })
})

describe('starting from a link', () => {
  it('guesses the kind of work from where the link lives', () => {
    expect(typeForUrl('https://github.com/o/seatfinder')).toBe('APP')
    expect(typeForUrl('https://youtu.be/abc')).toBe('FILM')
    expect(typeForUrl('https://www.figma.com/file/x')).toBe('DESIGN')
    expect(typeForUrl('https://artist.bandcamp.com/track/y')).toBe('AUDIO')
    expect(typeForUrl('https://example.com')).toBeNull()
    expect(typeForUrl('not a url')).toBeNull()
  })

  it('puts a repo’s demo and code into the app fields', () => {
    expect(
      placeLinks('APP', [
        { label: 'Live demo', url: 'https://seatfinder.app' },
        { label: 'Source code', url: 'https://github.com/o/s' },
      ])
    ).toEqual({
      answers: { live: 'https://seatfinder.app', repo: 'https://github.com/o/s' },
      rest: [],
    })
  })

  it('puts a plain website in the first empty link field, and keeps what does not fit', () => {
    expect(placeLinks('FILM', [{ label: 'Website', url: 'https://youtu.be/abc' }])).toEqual({
      answers: { video: 'https://youtu.be/abc' },
      rest: [],
    })
    // Writing has no link field at all.
    expect(placeLinks('WRITING', [{ label: 'Website', url: 'https://x.substack.com' }])).toEqual({
      answers: {},
      rest: [{ label: 'Website', url: 'https://x.substack.com' }],
    })
  })
})
