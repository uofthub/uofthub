import { describe, expect, it } from 'vitest'
import { extOf, formatBytes, lookFor, previewKindFor } from './files'
import { parseCsv } from '../components/FileViewer'

describe('previewKindFor', () => {
  it.each([
    ['diagram.png', 'image'],
    ['photo.JPEG', 'image'],
    ['report.pdf', 'pdf'],
    ['demo.mp4', 'video'],
    ['interview.mp3', 'audio'],
    ['README.md', 'text'],
    ['data.csv', 'text'],
  ])('%s previews as %s', (name, kind) => {
    expect(previewKindFor(name)).toBe(kind)
  })

  it.each(['thesis.docx', 'budget.xlsx', 'deck.pptx', 'source.zip', 'noextension'])(
    'has no preview for %s',
    (name) => {
      expect(previewKindFor(name)).toBeUndefined()
    }
  )

  it('reads the last extension, not the first', () => {
    // A file named to look like an image but ending .zip is a zip.
    expect(previewKindFor('image.png.zip')).toBeUndefined()
    expect(extOf('archive.tar.gz')).toBe('gz')
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1.0 KB'],
    [491520, '480 KB'],
    [1024 * 1024, '1.0 MB'],
    [1536 * 1024, '1.5 MB'],
    [1024 * 1024 * 1024, '1.0 GB'],
  ])('%i bytes reads as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })

  it('drops the decimal once the number is big enough not to need it', () => {
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB')
  })
})

describe('lookFor', () => {
  it('gives known types their own icon', () => {
    expect(lookFor('a.pdf').icon).toBe('mdi-file-pdf-box')
    expect(lookFor('a.xlsx').icon).toBe('mdi-file-table-outline')
  })

  it('falls back rather than returning undefined for an unknown type', () => {
    expect(lookFor('mystery.qqq')).toEqual({ icon: 'mdi-file-outline', color: 'grey' })
  })
})

describe('parseCsv', () => {
  it('parses a simple table', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps a comma inside quotes in one field', () => {
    expect(parseCsv('name,note\n"Doe, Jane",hi')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'hi'],
    ])
  })

  it('unescapes a doubled quote', () => {
    expect(parseCsv('q\n"She said ""hi"""')).toEqual([['q'], ['She said "hi"']])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps a newline that sits inside a quoted field', () => {
    expect(parseCsv('a\n"line one\nline two"')).toEqual([['a'], ['line one\nline two']])
  })

  it('does not leave a blank row from a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(2)
  })

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n\n')).toEqual([])
  })
})
