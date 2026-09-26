import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReleasedObjectUrls } from './hooks'

afterEach(() => vi.restoreAllMocks())

describe('useReleasedObjectUrls', () => {
  it('revokes a preview once it is replaced, and the rest when the page closes', () => {
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    const { rerender, unmount } = renderHook(
      (urls: (string | undefined)[]) => useReleasedObjectUrls(urls),
      { initialProps: ['blob:a', 'https://saved/thumb.webp'] }
    )

    rerender(['blob:b', 'https://saved/thumb.webp'])
    expect(revoke.mock.calls).toEqual([['blob:a']])

    unmount()
    // Never a saved thumbnail's URL: only what this page made.
    expect(revoke.mock.calls).toEqual([['blob:a'], ['blob:b']])
  })
})
