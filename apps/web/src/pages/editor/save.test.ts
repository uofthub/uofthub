import { describe, expect, it, vi } from 'vitest'
import { emptyDraft, settle, type Draft } from './draft'
import { saveDraft } from './save'

/**
 * The order a save happens in is the whole of "publish safely", so it is
 * tested as a sequence of calls against a fake API.
 */

function fakeApi(fail: Partial<Record<'upload' | 'update' | 'thumbnail' | 'invite', boolean>> = {}) {
  const calls: string[] = []
  const api = {
    create: vi.fn(async (body: { visibility?: string }) => {
      calls.push(`create:${body.visibility}`)
      return { id: 'p1' } as never
    }),
    update: vi.fn(async (_id: string, body: Record<string, unknown>) => {
      const kind = 'visibility' in body ? `visibility:${body.visibility}` : 'content'
      calls.push(`update:${kind}`)
      if (fail.update && kind === 'content') throw new Error('refused')
      const outputs = (body.outputs as unknown[] | undefined)?.map((_, i) => ({ id: `o${i}` }))
      return { id: 'p1', outputs: outputs ?? [] } as never
    }),
    uploadFile: vi.fn(async (_id: string, file: File) => {
      calls.push(`upload:${file.name}`)
      if (fail.upload) throw new Error('too big')
      return { id: `f-${file.name}` } as never
    }),
    uploadThumbnail: vi.fn(async (_id: string, outputId: string) => {
      calls.push(`thumbnail:${outputId}`)
      if (fail.thumbnail) throw new Error('not an image')
      return { thumbnailUrl: 'u' }
    }),
    deleteThumbnail: vi.fn(async (_id: string, outputId: string) => {
      calls.push(`unthumbnail:${outputId}`)
      return { ok: true }
    }),
    inviteCollaborator: vi.fn(async (_id: string, email: string) => {
      calls.push(`invite:${email}`)
      if (fail.invite) throw new Error('no such user')
      return {} as never
    }),
  }
  return { api, calls }
}

const poster = new File(['%PDF'], 'poster.pdf')

const draft = (overrides: Partial<Draft> = {}) =>
  emptyDraft({
    title: 'Poster',
    showFrom: '2026-12-20',
    outputs: [
      {
        key: 'k',
        kind: 'POSTER',
        label: '',
        primary: true,
        target: { type: 'newFile', file: poster },
        thumbnail: new Blob(['x'], { type: 'image/webp' }),
      },
    ],
    invites: [{ email: 'friend@mail.utoronto.ca', role: '' }],
    ...overrides,
  })

describe('saving a new project', () => {
  it('creates a private draft, fills it, and makes it visible last', async () => {
    const { api, calls } = fakeApi()
    const result = await saveDraft(draft(), { visibility: 'PUBLIC' }, api)
    expect(calls).toEqual([
      'create:PRIVATE',
      'upload:poster.pdf',
      'update:content',
      'thumbnail:o0',
      'invite:friend@mail.utoronto.ca',
      'update:visibility:PUBLIC',
    ])
    expect(result).toMatchObject({ projectId: 'p1', failed: [], visibilityApplied: true })
    // The show-from date is written with the visibility, in the same request.
    expect(api.update).toHaveBeenLastCalledWith('p1', {
      visibility: 'PUBLIC',
      showFrom: '2026-12-20',
    })
  })

  it('points the output at the file it just uploaded', async () => {
    const { api } = fakeApi()
    await saveDraft(draft(), { visibility: 'PUBLIC' }, api)
    const content = api.update.mock.calls[0][1] as { outputs: unknown[] }
    expect(content.outputs).toEqual([
      { kind: 'POSTER', label: null, primary: true, fileId: 'f-poster.pdf' },
    ])
  })

  it.each(['upload', 'thumbnail', 'invite', 'update'] as const)(
    'stays a private draft when a %s fails, and says what failed',
    async (step) => {
      const { api, calls } = fakeApi({ [step]: true })
      const result = await saveDraft(draft(), { visibility: 'PUBLIC' }, api)
      expect(calls).not.toContain('update:visibility:PUBLIC')
      expect(result.visibilityApplied).toBe(false)
      expect(result.failed).toHaveLength(1)
    }
  )

  it('creates nothing when the project itself is refused', async () => {
    const { api } = fakeApi()
    api.create.mockRejectedValueOnce(new Error('A custom section needs a title'))
    await expect(saveDraft(draft(), { visibility: 'PUBLIC' }, api)).rejects.toThrow(/title/)
    expect(api.uploadFile).not.toHaveBeenCalled()
  })
})

describe('saving an existing project', () => {
  it('writes to it without creating one, and applies the chosen visibility last', async () => {
    const { api, calls } = fakeApi()
    await saveDraft(draft({ invites: [] }), { projectId: 'p1', visibility: 'PRIVATE' }, api)
    expect(calls[0]).toBe('upload:poster.pdf')
    expect(calls.at(-1)).toBe('update:visibility:PRIVATE')
    expect(api.create).not.toHaveBeenCalled()
  })

  it('clears a thumbnail the author removed', async () => {
    const { api, calls } = fakeApi()
    await saveDraft(
      emptyDraft({
        title: 'Poster',
        outputs: [
          {
            key: 'o9',
            id: 'o9',
            kind: 'POSTER',
            label: '',
            primary: true,
            target: { type: 'file', fileId: 'f9', name: 'poster.pdf' },
            thumbnail: 'remove',
          },
        ],
      }),
      { projectId: 'p1', visibility: 'UOFT' },
      api
    )
    expect(calls).toContain('unthumbnail:o0')
  })
})

describe('saving again after a partial failure', () => {
  it('retries only what failed: nothing is uploaded or invited twice', async () => {
    const { api } = fakeApi({ thumbnail: true })
    const first = await saveDraft(draft(), { visibility: 'PUBLIC' }, api)
    expect(first.visibilityApplied).toBe(false)

    const again = settle(draft(), first)
    // The poster is the project's own file now, and its output has its id.
    expect(again.outputs[0].target).toEqual({ type: 'file', fileId: 'f-poster.pdf', name: 'poster.pdf' })
    expect(again.outputs[0].id).toBe('o0')
    // The thumbnail failed, so it is still waiting; the invitation went out.
    expect(again.outputs[0].thumbnail).toBeInstanceOf(Blob)
    expect(again.invites).toEqual([])

    const retry = fakeApi()
    const second = await saveDraft(again, { projectId: first.projectId, visibility: 'PUBLIC' }, retry.api)
    expect(retry.calls).toEqual([
      'update:content',
      'thumbnail:o0',
      'update:visibility:PUBLIC',
    ])
    expect(second.visibilityApplied).toBe(true)
  })
})

describe('saving a taken-down project', () => {
  it('never sends a visibility, which the API would refuse', async () => {
    const { api } = fakeApi()
    await saveDraft(emptyDraft({ title: 'x', showFrom: '' }), { projectId: 'p1' }, api)
    expect(api.update).toHaveBeenLastCalledWith('p1', { showFrom: null })
  })
})
