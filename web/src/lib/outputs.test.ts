import { describe, expect, it } from 'vitest'
import {
  cardAction,
  outputKindForFile,
  outputKindForLink,
  outputLabel,
  primaryOutput,
  resolveOutputs,
} from './outputs'

describe('output kinds', () => {
  it('are guessed from a file’s name', () => {
    expect(outputKindForFile('final.pptx')).toBe('SLIDES')
    expect(outputKindForFile('talk.MP4')).toBe('VIDEO')
    expect(outputKindForFile('results.csv')).toBe('DATASET')
    expect(outputKindForFile('report.pdf')).toBe('PAPER')
    expect(outputKindForFile('photo.jpg')).toBe('OTHER')
  })

  it('are guessed from where a link points', () => {
    expect(outputKindForLink({ label: '', url: 'https://github.com/o/r' })).toBe('CODE')
    expect(outputKindForLink({ label: '', url: 'https://youtu.be/x' })).toBe('VIDEO')
    expect(outputKindForLink({ label: 'Live demo', url: 'https://x.app' })).toBe('DEMO')
  })

  it('are named by the author’s label, else the kind', () => {
    expect(outputLabel({ kind: 'POSTER', label: 'Final poster' })).toBe('Final poster')
    expect(outputLabel({ kind: 'POSTER', label: '  ' })).toBe('Poster')
  })
})

describe('resolveOutputs', () => {
  const file = { id: 'f1', projectId: 'p', name: 'poster.pdf', sizeBytes: 1, uploadedAt: '' }
  const link = { id: 'l1', projectId: 'p', label: 'Talk', url: 'https://youtu.be/x' }

  it('joins outputs to their files and links, keeping order, and finds the primary', () => {
    const outputs = resolveOutputs({
      files: [file],
      links: [link],
      outputs: [
        { id: 'o2', kind: 'VIDEO', linkId: 'l1', primary: false },
        { id: 'o1', kind: 'POSTER', fileId: 'f1', primary: true },
      ],
    })
    expect(outputs.map((o) => [o.id, o.file?.name ?? o.link?.label])).toEqual([
      ['o2', 'Talk'],
      ['o1', 'poster.pdf'],
    ])
    expect(primaryOutput(outputs)?.id).toBe('o1')
  })

  it('leaves out an output whose target is gone', () => {
    expect(
      resolveOutputs({
        files: [],
        links: [],
        outputs: [{ id: 'o1', kind: 'POSTER', fileId: 'missing', primary: true }],
      })
    ).toEqual([])
  })
})

describe('cardAction', () => {
  const links = [
    { id: 'l1', projectId: 'p', label: 'Live demo', url: 'https://x.app' },
    { id: 'l2', projectId: 'p', label: 'Talk', url: 'https://youtu.be/x' },
  ]

  it('names the button after the lead output, and opens a file in the project’s viewer', () => {
    expect(
      cardAction({
        id: 'p',
        links,
        lead: { kind: 'POSTER', label: null, fileId: 'f1', linkId: null },
      })
    ).toEqual({ label: 'View poster', icon: 'image', to: '/projects/p?view=f1' })
  })

  it('sends a lead link where it points', () => {
    expect(
      cardAction({
        id: 'p',
        links,
        lead: { kind: 'VIDEO', label: 'Talk', fileId: null, linkId: 'l2' },
      })
    ).toMatchObject({ label: 'Watch', href: 'https://youtu.be/x' })
  })

  it('falls back to the links without a lead', () => {
    expect(cardAction({ id: 'p', links })).toMatchObject({
      label: 'Try it live',
      href: 'https://x.app/',
    })
  })
})
