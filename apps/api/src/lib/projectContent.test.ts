import { describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { SECTION_LIMITS, parseDetails, parseSections } from './projectContent.js'

const ok = <T>(result: { value: T | null } | { error: string }) => {
  if ('error' in result) throw new Error(`expected success, got: ${result.error}`)
  return result.value
}
const err = (result: { value: unknown } | { error: string }) =>
  'error' in result ? result.error : null

describe('parseSections', () => {
  it('keeps what was written, in order, trimmed', () => {
    expect(
      ok(
        parseSections([
          { id: 'a', kind: 'motivation', body: '  Why it matters.  ' },
          { id: 'b', kind: 'results', title: 'What we found', body: 'It worked.' },
        ])
      )
    ).toEqual([
      { id: 'a', kind: 'motivation', body: 'Why it matters.' },
      { id: 'b', kind: 'results', title: 'What we found', body: 'It worked.' },
    ])
  })

  it('drops a section with nothing in it, even one with a title', () => {
    expect(
      ok(
        parseSections([
          { id: 'a', kind: 'motivation', body: '   ' },
          { id: 'b', kind: 'results', title: 'Results', body: '' },
          { id: 'c', kind: 'method', body: 'Surveys.' },
        ])
      )
    ).toEqual([{ id: 'c', kind: 'method', body: 'Surveys.' }])
  })

  it('stores nothing at all when every section is empty', () => {
    expect(ok(parseSections([{ kind: 'motivation', body: '' }]))).toBeNull()
    expect(ok(parseSections([]))).toBeNull()
    expect(ok(parseSections(null))).toBeNull()
  })

  it('drops empty items, and a section whose items were all empty', () => {
    expect(
      ok(
        parseSections([
          {
            id: 'a',
            kind: 'approaches',
            items: [
              { label: 'Human baseline', body: '71% accurate' },
              { label: '', body: '' },
              { label: 'LLM prompting' },
            ],
          },
          { id: 'b', kind: 'examples', items: [{ label: ' ', body: ' ' }] },
        ])
      )
    ).toEqual([
      {
        id: 'a',
        kind: 'approaches',
        items: [{ label: 'Human baseline', body: '71% accurate' }, { label: 'LLM prompting' }],
      },
    ])
  })

  it('gives a section without an id one of its own', () => {
    const [section] = ok(parseSections([{ kind: 'data', body: 'Census 2021.' }]))!
    expect(section.id).toMatch(/^s[0-9a-f]{10}$/)
  })

  it('refuses a custom section without a title, since nothing would name it', () => {
    expect(err(parseSections([{ kind: 'custom', body: 'Thanks to…' }]))).toMatch(/title/)
    expect(
      ok(parseSections([{ id: 'x', kind: 'custom', title: 'Thanks', body: 'To the lab.' }]))
    ).toHaveLength(1)
  })

  it('allows one section of each kind, but custom ones repeat', () => {
    expect(
      err(
        parseSections([
          { kind: 'results', body: 'one' },
          { kind: 'results', body: 'two' },
        ])
      )
    ).toMatch(/only one results/)
    expect(
      ok(
        parseSections([
          { kind: 'custom', title: 'A', body: 'one' },
          { kind: 'custom', title: 'B', body: 'two' },
        ])
      )
    ).toHaveLength(2)
    // An empty duplicate is dropped before the rule applies.
    expect(
      ok(
        parseSections([
          { kind: 'results', body: 'one' },
          { kind: 'results', body: '' },
        ])
      )
    ).toHaveLength(1)
  })

  it('refuses items where they mean nothing, and an item with text but no name', () => {
    expect(err(parseSections([{ kind: 'results', items: [{ label: 'A', body: 'x' }] }]))).toMatch(
      /Only approaches and examples/
    )
    expect(err(parseSections([{ kind: 'examples', items: [{ label: '', body: 'x' }] }]))).toMatch(
      /name/
    )
  })

  it('refuses unknown kinds, bad ids, repeated ids and the wrong shape', () => {
    expect(err(parseSections([{ kind: 'abstract', body: 'x' }]))).toMatch(/Unknown section kind/)
    expect(err(parseSections([{ id: 'has space', kind: 'data', body: 'x' }]))).toMatch(/id/)
    expect(
      err(
        parseSections([
          { id: 'same', kind: 'data', body: 'x' },
          { id: 'same', kind: 'method', body: 'y' },
        ])
      )
    ).toMatch(/share an id/)
    expect(err(parseSections('motivation: why'))).toMatch(/list/)
  })

  it('enforces the limits', () => {
    const many = Array.from({ length: SECTION_LIMITS.sections + 1 }, (_, i) => ({
      kind: 'custom',
      title: `S${i}`,
      body: 'x',
    }))
    expect(err(parseSections(many))).toMatch(/at most 16 sections/)
    expect(
      err(parseSections([{ kind: 'data', body: 'x'.repeat(SECTION_LIMITS.body + 1) }]))
    ).toMatch(/at most 20,000/)
    // Each body within its limit, but the whole list over the row's backstop.
    const heavy = Array.from({ length: 6 }, (_, i) => ({
      kind: 'custom',
      title: `S${i}`,
      body: 'x'.repeat(SECTION_LIMITS.body),
    }))
    expect(err(parseSections(heavy))).toMatch(/more than a project can hold/)
  })
})

describe('parseDetails', () => {
  it('keeps labelled facts in order, trimmed, and allows a label twice', () => {
    expect(
      ok(
        parseDetails([
          { label: ' Performer ', value: ' Aisha (violin) ' },
          { label: 'Performer', value: 'Omar (cello)' },
        ])
      )
    ).toEqual([
      { label: 'Performer', value: 'Aisha (violin)' },
      { label: 'Performer', value: 'Omar (cello)' },
    ])
  })

  it('drops a row missing either side, and stores nothing when none are left', () => {
    expect(ok(parseDetails([{ label: 'Runtime', value: '' }, { label: '', value: '6:12' }]))).toBeNull()
  })

  it('enforces the limits', () => {
    expect(err(parseDetails([{ label: 'x'.repeat(41), value: 'y' }]))).toMatch(/at most 40/)
    expect(
      err(parseDetails(Array.from({ length: 13 }, () => ({ label: 'a', value: 'b' }))))
    ).toMatch(/at most 12/)
  })
})

describe('the migration that moves details out of descriptions', () => {
  const split = async (body: string | null) => {
    const [row] = await db.$queryRaw<{ split: { details: unknown; description: string | null } }[]>`
      SELECT uofthub_split_legacy_details(${body}) AS split
    `
    return row.split
  }

  it('moves the lines the old post form wrote, in order, and keeps the rest', async () => {
    expect(
      await split('A short film about the ferry.\n\n**Runtime:** 6:12\n\n**Credits:** Aisha, Omar')
    ).toEqual({
      details: [
        { label: 'Runtime', value: '6:12' },
        { label: 'Credits', value: 'Aisha, Omar' },
      ],
      description: 'A short film about the ferry.',
    })
  })

  it('leaves no description behind when details were all it had', async () => {
    expect(await split('**Supervisor or lab:** Aquatic Ecology Lab')).toEqual({
      details: [{ label: 'Supervisor or lab', value: 'Aquatic Ecology Lab' }],
      description: null,
    })
  })

  it('leaves a student’s own bold text alone', async () => {
    const own = '**Note:** this is a draft\n\nSome **Runtime:** words inside a paragraph.'
    expect(await split(own)).toEqual({ details: null, description: own })
  })

  it('leaves a long or multi-line value in the description', async () => {
    const long = `**Credits:** ${'x'.repeat(201)}`
    expect((await split(long)).details).toBeNull()
    const lines = '**Credits:** Aisha\nOmar and the whole second-year cohort'
    expect((await split(lines)).details).toBeNull()
  })

  it('passes an empty description through', async () => {
    expect(await split(null)).toEqual({ details: null, description: null })
  })
})
