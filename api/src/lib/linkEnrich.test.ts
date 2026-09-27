import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in client, so these tests can count calls without a key or credits.
const parse = vi.fn()
vi.mock('./openai.js', () => ({
  aiModel: () => 'test-model',
  openaiClient: () => ({ responses: { parse } }),
}))

const { enrichImport, resetEnrichState, worthFilling } = await import('./linkEnrich.js')

const answer = {
  title: 'Seatfinder',
  pitch: 'Live map of open study seats',
  description: null,
  type: 'APP',
  status: null,
  tags: ['maps'],
  details: [],
}

const source = (url = 'https://seatfinder.app') => ({ url, tags: [], text: 'Seatfinder' })

beforeEach(() => {
  resetEnrichState()
  parse.mockReset().mockResolvedValue({ output_parsed: answer })
})

afterEach(() => {
  delete process.env.AI_IMPORT_PER_STUDENT_DAY
  delete process.env.AI_IMPORT_PER_DAY
})

describe('AI fill-in spending', () => {
  it('pays for a link once, however many students paste it', async () => {
    expect(await enrichImport(source(), 'u1')).toMatchObject({ title: 'Seatfinder' })
    expect(await enrichImport(source(), 'u2')).toMatchObject({ title: 'Seatfinder' })
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it('stops at a student’s daily allowance, and at the site’s', async () => {
    process.env.AI_IMPORT_PER_STUDENT_DAY = '2'
    process.env.AI_IMPORT_PER_DAY = '3'
    expect(await enrichImport(source('https://a.dev'), 'u1')).not.toBeNull()
    expect(await enrichImport(source('https://b.dev'), 'u1')).not.toBeNull()
    expect(await enrichImport(source('https://c.dev'), 'u1')).toBeNull()
    expect(await enrichImport(source('https://d.dev'), 'u2')).not.toBeNull()
    expect(await enrichImport(source('https://e.dev'), 'u3')).toBeNull()
    expect(parse).toHaveBeenCalledTimes(3)
    // A link already paid for is still free past the limit.
    expect(await enrichImport(source('https://a.dev'), 'u3')).not.toBeNull()
  })

  it('makes no call when the page already filled the form', async () => {
    const full = {
      url: 'https://github.com/o/r',
      title: 'r',
      pitch: 'A thing',
      description: '# r',
      tags: ['a', 'b', 'c'],
    }
    expect(worthFilling(full)).toBe(false)
    expect(worthFilling({ ...full, tags: ['a'] })).toBe(true)
    expect(await enrichImport(full, 'u1')).toBeNull()
    expect(parse).not.toHaveBeenCalled()
  })

  it('asks for no write-up when the source has one, and sends a bounded page', async () => {
    await enrichImport(
      { url: 'https://x.dev', tags: [], description: '# README', text: 'y'.repeat(50_000) },
      'u1'
    )
    const { input, max_output_tokens } = parse.mock.calls[0][0]
    expect(input).toContain('leave description null')
    expect(input.length).toBeLessThan(4_500)
    expect(max_output_tokens).toBeLessThanOrEqual(1500)
  })

  it('treats a failed call as no fill-in, and does not cache it', async () => {
    parse.mockRejectedValueOnce(new Error('down'))
    vi.spyOn(console, 'warn').mockImplementationOnce(() => {})
    expect(await enrichImport(source(), 'u1')).toBeNull()
    expect(await enrichImport(source(), 'u1')).not.toBeNull()
  })
})
