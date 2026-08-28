import { describe, expect, it } from 'vitest'
import { safeDiscordUrl, safeExternalUrl } from './url.js'

describe('safeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeExternalUrl('http://example.com/')).toBe('http://example.com/')
  })

  it('rejects the protocols that become stored XSS in an href', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('JavaScript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html;base64,PHN2Zz4=')).toBeNull()
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('rejects relative and empty input', () => {
    expect(safeExternalUrl('/projects/1')).toBeNull()
    expect(safeExternalUrl('example.com')).toBeNull()
    expect(safeExternalUrl('   ')).toBeNull()
    expect(safeExternalUrl(undefined)).toBeNull()
  })
})

describe('safeDiscordUrl', () => {
  it('accepts the hosts a real invite lives on', () => {
    expect(safeDiscordUrl('https://discord.gg/abc123')).toBe('https://discord.gg/abc123')
    expect(safeDiscordUrl('https://discord.com/invite/abc')).toBe('https://discord.com/invite/abc')
  })

  it('rejects a valid URL that simply is not Discord', () => {
    // The link renders behind a Discord badge, so anything else would be
    // misdirection we are hosting.
    expect(safeDiscordUrl('https://example.com/discord')).toBeNull()
    expect(safeDiscordUrl('https://discord.gg.evil.example/abc')).toBeNull()
  })

  it('still rejects unsafe protocols', () => {
    expect(safeDiscordUrl('javascript:alert(1)')).toBeNull()
  })
})
