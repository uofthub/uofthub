import { describe, expect, it } from 'vitest'
import { sectionAnchor, sectionLabel, shownSections } from './sections'

describe('section headings', () => {
  it('follow the project’s type', () => {
    const method = { id: 'm', kind: 'method' as const, body: 'x' }
    expect(sectionLabel(method, 'RESEARCH')).toBe('Methodology')
    expect(sectionLabel(method, 'FILM')).toBe('Process')
    expect(sectionLabel(method, 'DESIGN')).toBe('Process')
    expect(sectionLabel(method, 'APP')).toBe('How it works')
  })

  it('fall back to the plain name when the type says nothing different, or there is none', () => {
    expect(sectionLabel({ id: 'd', kind: 'data', body: 'x' }, 'RESEARCH')).toBe('Data')
    expect(sectionLabel({ id: 'r', kind: 'results', body: 'x' }, null)).toBe('Results')
    expect(sectionLabel({ id: 'r', kind: 'results', body: 'x' }, 'OTHER')).toBe('Results')
  })

  it('use the title the author or a template gave', () => {
    expect(
      sectionLabel(
        { id: 'm', kind: 'motivation', title: 'Task & motivation', body: 'x' },
        'RESEARCH'
      )
    ).toBe('Task & motivation')
    expect(sectionLabel({ id: 'c', kind: 'custom', title: 'Thanks', body: 'x' })).toBe('Thanks')
  })
})

describe('shownSections', () => {
  it('leaves out anything empty, however it got there', () => {
    expect(
      shownSections([
        { id: 'a', kind: 'motivation', title: 'Why', body: '  ' },
        { id: 'b', kind: 'examples', items: [{ label: '', body: ' ' }] },
        { id: 'c', kind: 'results', body: 'It worked.' },
      ]).map((s) => s.id)
    ).toEqual(['c'])
  })

  it('thins empty items but keeps the section when others remain', () => {
    const [section] = shownSections([
      {
        id: 'a',
        kind: 'approaches',
        items: [{ label: 'Human baseline', body: '71%' }, { label: '' }],
      },
    ])
    expect(section.items).toEqual([{ label: 'Human baseline', body: '71%' }])
  })

  it('treats no sections at all as none', () => {
    expect(shownSections(null)).toEqual([])
    expect(shownSections(undefined)).toEqual([])
  })

  it('anchors each section by its id', () => {
    expect(sectionAnchor({ id: 'why' })).toBe('section-why')
  })
})
