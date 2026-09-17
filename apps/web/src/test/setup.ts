import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// jsdom keeps the document between tests in a file; without this, a query like
// getByText would find the previous test's tree as well as this one's.
afterEach(cleanup)

/**
 * A working `localStorage`.
 *
 * Node 22 defines a `localStorage` global of its own, and under this runner it
 * arrives as a bare `{}` — `getItem` and `setItem` are simply not there, and
 * jsdom's implementation never gets a look in. Application code that stores a
 * preference (the directory's grid/list choice, the theme, the signed-in hint)
 * therefore throws in tests while working perfectly in a browser, which is the
 * worst kind of difference between the two.
 *
 * Installed only when the environment has not provided a usable one, so this
 * disappears on its own if the runner ever grows a real implementation.
 */
if (typeof globalThis.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    },
  })
}

// One test's stored preference must not decide the next one's starting state.
beforeEach(() => localStorage.clear())
