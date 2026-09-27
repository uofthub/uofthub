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

  it('take a path that starts with @ as a person or their project', () => {
    expect(isAppRoute('/@ada')).toBe(true)
    expect(isAppRoute('/%40ada')).toBe(true)
    expect(isAppRoute('/@ada/study-buddy')).toBe(true)
    expect(isAppRoute('/@')).toBe(false)
    expect(isAppRoute('/ada')).toBe(false)
    expect(isAppRoute('/ada/study-buddy')).toBe(false)
    expect(isAppRoute('/@ada/study-buddy/more')).toBe(false)
    expect(isAppRoute('/%E0%A4%A')).toBe(false)
  })
})
