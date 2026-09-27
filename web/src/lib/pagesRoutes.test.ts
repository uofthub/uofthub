import { describe, expect, it } from 'vitest'
import app from '../App.tsx?raw'
import { APP_ROUTES, isAppRoute } from '../../functions/_routes.js'

// The Pages Functions answer a path the app has no page for with a 404, so
// their list has to be the app's own.
describe('the routes the Pages Functions know of', () => {
  it('are exactly the ones App.tsx declares', () => {
    const declared = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((path) => path !== '*')
    expect([...APP_ROUTES].sort()).toEqual(declared.sort())
  })

  it('match parameters and a trailing slash, and nothing else', () => {
    expect(isAppRoute('/')).toBe(true)
    expect(isAppRoute('/projects/3f2a')).toBe(true)
    expect(isAppRoute('/projects/3f2a/edit')).toBe(true)
    expect(isAppRoute('/about/')).toBe(true)
    expect(isAppRoute('/projects/3f2a/nope')).toBe(false)
    expect(isAppRoute('/wp-login.php')).toBe(false)
  })
})
