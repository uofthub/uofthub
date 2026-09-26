import { describe, expect, it } from 'vitest'
import type { CourseTemplate, ProjectDetail } from '../../lib/api'
import {
  applyTemplate,
  contentPayload,
  draftFromProject,
  emptyDraft,
  keepRemoved,
  outputsPayload,
  removeExisting,
  sectionsPayload,
  suggestedDetails,
  torontoDay,
  type DraftOutput,
} from './draft'

const template: CourseTemplate = {
  code: 'CSC211H5',
  version: 1,
  type: 'RESEARCH',
  intro: 'Compare approaches.',
  primaryOutput: { kind: 'POSTER', prompt: 'Upload your poster', accept: '.pdf' },
  sections: [
    { kind: 'motivation', title: 'Task & motivation', prompt: 'Why?' },
    {
      kind: 'approaches',
      title: 'Approaches',
      prompt: 'How?',
      items: [{ label: 'Human baseline' }, { label: 'LLM prompting' }],
    },
  ],
  references: { kinds: ['DATASET'], prompt: 'Data you used' },
}

describe('applyTemplate', () => {
  it('fills an empty draft with the course’s type, course and sections', () => {
    const draft = applyTemplate(emptyDraft(), template)
    expect(draft.type).toBe('RESEARCH')
    expect(draft.courseCode).toBe('CSC211H5')
    expect(draft.template).toEqual({ code: 'CSC211H5', version: 1 })
    expect(draft.sections.map((s) => [s.kind, s.title, s.prompt])).toEqual([
      ['motivation', 'Task & motivation', 'Why?'],
      ['approaches', 'Approaches', 'How?'],
    ])
    expect(draft.hints.output?.kind).toBe('POSTER')
  })

  it('never overwrites what the student already wrote', () => {
    const mine = emptyDraft({
      type: 'DESIGN',
      courseCode: 'CSC211',
      sections: [{ id: 's1', kind: 'motivation', title: '', body: 'My own words', items: [] }],
    })
    const draft = applyTemplate(mine, template)
    expect(draft.type).toBe('DESIGN')
    expect(draft.courseCode).toBe('CSC211')
    expect(draft.sections.filter((s) => s.kind === 'motivation')).toEqual([mine.sections[0]])
    expect(draft.sections.map((s) => s.kind)).toEqual(['motivation', 'approaches'])
  })

  it('leaves nothing behind when none of it is filled in', () => {
    const draft = applyTemplate(emptyDraft({ title: 'Poster' }), template)
    const sections = sectionsPayload(draft.sections)!
    // Sent with no body and no items: the API strips every one of them.
    expect(sections.every((s) => !s.body && s.items?.length === 0)).toBe(true)
  })

  it('keeps an approach once the student has written about it', () => {
    const draft = applyTemplate(emptyDraft(), template)
    const approaches = draft.sections[1]
    approaches.items[1].body = '64% accurate'
    expect(sectionsPayload([approaches])![0].items).toEqual([
      { label: 'LLM prompting', body: '64% accurate' },
    ])
  })
})

describe('draftFromProject', () => {
  const project = {
    id: 'p1',
    title: 'Poster',
    tags: ['vision'],
    visibility: 'UOFT',
    showFrom: '2026-12-20T05:00:00.000Z',
    courseCode: 'CSC211H5',
    files: [{ id: 'f1', projectId: 'p1', name: 'poster.pdf', sizeBytes: 1, uploadedAt: '' }],
    links: [{ id: 'l1', projectId: 'p1', label: 'Talk', url: 'https://youtu.be/x' }],
    sections: [{ id: 's1', kind: 'results', body: 'It worked', items: [] }],
    details: [{ label: 'Supervisor', value: 'Prof. Ada' }],
    references: [{ id: 'r1', kind: 'PAPER', title: 'A paper', doi: '10.1/x', year: 2020 }],
    outputs: [
      { id: 'o1', kind: 'POSTER', fileId: 'f1', primary: true, thumbnailUrl: 'https://s/t' },
      { id: 'o2', kind: 'VIDEO', linkId: 'l1', primary: false },
      { id: 'o3', kind: 'OTHER', fileId: 'gone', primary: false },
    ],
  } as unknown as ProjectDetail

  it('reads every part of a saved project back', () => {
    const draft = draftFromProject(project)
    expect(draft.courseCode).toBe('CSC211H5')
    expect(draft.showFrom).toBe('2026-12-20')
    expect(draft.sections[0]).toMatchObject({ id: 's1', kind: 'results', body: 'It worked' })
    expect(draft.details[0]).toMatchObject({ label: 'Supervisor', value: 'Prof. Ada' })
    expect(draft.references[0]).toMatchObject({ title: 'A paper', doi: '10.1/x', year: '2020' })
  })

  it('joins outputs to their files and links, dropping one whose target is gone', () => {
    const draft = draftFromProject(project)
    expect(draft.outputs.map((o) => [o.id, o.target.type])).toEqual([
      ['o1', 'file'],
      ['o2', 'link'],
    ])
    expect(draft.outputs[0].thumbnailUrl).toBe('https://s/t')
  })
})

describe('outputsPayload', () => {
  const file = new File(['x'], 'poster.pdf')
  const output = (target: DraftOutput['target'], extra: Partial<DraftOutput> = {}): DraftOutput => ({
    key: 'k',
    kind: 'POSTER',
    label: '',
    primary: false,
    target,
    ...extra,
  })

  it('points new files at their uploaded ids, and skips one that failed to upload', () => {
    const other = new File(['y'], 'slides.pdf')
    expect(
      outputsPayload(
        [
          output({ type: 'newFile', file }, { primary: true }),
          output({ type: 'newFile', file: other }),
          output({ type: 'newLink', label: 'Demo', url: 'https://x.app' }, { kind: 'DEMO' }),
          output({ type: 'file', fileId: 'f9', name: 'old.pdf' }, { id: 'o9', label: 'Old' }),
        ],
        new Map([[file, 'f1']])
      )
    ).toEqual([
      { kind: 'POSTER', label: null, primary: true, fileId: 'f1' },
      { kind: 'DEMO', label: null, primary: false, link: { label: 'Demo', url: 'https://x.app' } },
      { id: 'o9', kind: 'POSTER', label: 'Old', primary: false, fileId: 'f9' },
    ])
  })
})

describe('contentPayload', () => {
  it('sends blanks as none, and the course once rather than as a tag too', () => {
    const payload = contentPayload(
      emptyDraft({
        title: ' Poster ',
        pitch: '  ',
        courseCode: 'CSC211H5',
        tags: ['csc211h5', 'vision'],
        references: [
          { key: 'r', kind: 'DATASET', title: 'Census', url: '', doi: '', authors: '', year: '20x', note: '' },
        ],
      })
    )
    expect(payload.title).toBe('Poster')
    expect(payload.pitch).toBeNull()
    expect(payload.tags).toEqual(['vision'])
    expect(payload.references).toEqual([
      { kind: 'DATASET', title: 'Census', url: null, doi: null, authors: null, year: null, note: null },
    ])
    // Visibility is never part of it — that is written last, on its own.
    expect(payload).not.toHaveProperty('visibility')
    expect(payload).not.toHaveProperty('showFrom')
  })
})

describe('small helpers', () => {
  it('reads a show-from instant as the Toronto day it falls on', () => {
    expect(torontoDay('2026-12-20T05:00:00.000Z')).toBe('2026-12-20')
    expect(torontoDay('2026-12-20T04:59:00.000Z')).toBe('2026-12-19')
    expect(torontoDay(null)).toBe('')
  })

  it('suggests a type’s details as empty rows', () => {
    expect(suggestedDetails('FILM').map((d) => [d.label, d.value])).toEqual([
      ['Runtime', ''],
      ['Credits', ''],
    ])
  })
})

describe('removing a file or link already on the project', () => {
  const poster: DraftOutput = {
    key: 'o1',
    id: 'o1',
    kind: 'POSTER',
    label: '',
    primary: true,
    target: { type: 'file', fileId: 'f1', name: 'poster.pdf' },
  }
  const talk: DraftOutput = {
    key: 'o2',
    id: 'o2',
    kind: 'VIDEO',
    label: '',
    primary: false,
    target: { type: 'link', linkId: 'l1', label: 'Talk', url: 'https://youtu.be/x' },
  }

  it('drops the outputs made of it, and brings them back when kept', () => {
    const start = emptyDraft({ outputs: [poster, talk] })
    const gone = removeExisting(start, 'file', { id: 'f1', name: 'poster.pdf' })
    expect(gone.outputs.map((o) => o.key)).toEqual(['o2'])
    expect(gone.removedFiles.map((f) => f.id)).toEqual(['f1'])

    const kept = keepRemoved(gone)
    expect(kept.removedFiles).toEqual([])
    expect(kept.outputs.map((o) => [o.key, o.primary])).toEqual([
      ['o2', false],
      ['o1', true],
    ])
  })

  it('does not hand the lead back if another output took it meanwhile', () => {
    const gone = removeExisting(emptyDraft({ outputs: [poster, talk] }), 'file', {
      id: 'f1',
      name: 'poster.pdf',
    })
    const led = { ...gone, outputs: gone.outputs.map((o) => ({ ...o, primary: true })) }
    expect(keepRemoved(led).outputs.filter((o) => o.primary).map((o) => o.key)).toEqual(['o2'])
  })
})
