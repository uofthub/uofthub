import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createUser, getApp, resetDb, uniqueIp } from '../test/helpers.js'

beforeEach(resetDb)

const PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** The insert is fire-and-forget, so a test waits for it rather than the response. */
const scansSoon = (count: number) =>
  vi.waitFor(async () => expect(await db.campaignScan.count()).toBe(count), { timeout: 2000 })

/** Time for a stray insert to land, before asserting that none did. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 250))

describe('GET /go/:source', () => {
  it('redirects to the home page with a 302, UTM tags and no-store', async () => {
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: '/go/lid',
      headers: { 'user-agent': PHONE },
      remoteAddress: uniqueIp(),
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('http://localhost:5173/?utm_source=lid&utm_medium=qr')
    expect(res.headers['cache-control']).toBe('no-store')
    await scansSoon(1)
  })

  it('records a scan with a hashed visitor and no address', async () => {
    const app = await getApp()
    const ip = uniqueIp()
    await app.inject({
      method: 'GET',
      url: '/go/lid',
      headers: { 'user-agent': PHONE, referer: 'https://example.com/' },
      remoteAddress: ip,
    })
    await scansSoon(1)
    const scan = await db.campaignScan.findFirstOrThrow()
    expect(scan).toMatchObject({ source: 'lid', userAgent: PHONE, referer: 'https://example.com/' })
    expect(scan.visitorHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(scan)).not.toContain(ip)
  })

  it('gives the same visitor the same hash within a day', async () => {
    const app = await getApp()
    const ip = uniqueIp()
    for (let i = 0; i < 2; i++)
      await app.inject({
        method: 'GET',
        url: '/go/lid',
        headers: { 'user-agent': PHONE },
        remoteAddress: ip,
      })
    await scansSoon(2)
    const hashes = new Set((await db.campaignScan.findMany()).map((s) => s.visitorHash))
    expect(hashes.size).toBe(1)
  })

  it('redirects a link-preview bot without recording it', async () => {
    const app = await getApp()
    for (const ua of [
      'Slackbot-LinkExpanding 1.0',
      'facebookexternalhit/1.1',
      'WhatsApp/2.23',
      'Googlebot/2.1',
    ]) {
      const res = await app.inject({ method: 'GET', url: '/go/lid', headers: { 'user-agent': ua } })
      expect(res.statusCode).toBe(302)
      expect(res.headers.location).toContain('utm_source=lid')
    }
    await settle()
    expect(await db.campaignScan.count()).toBe(0)
  })

  it('redirects a HEAD request without recording it', async () => {
    const app = await getApp()
    const res = await app.inject({
      method: 'HEAD',
      url: '/go/lid',
      headers: { 'user-agent': PHONE },
    })
    expect(res.statusCode).toBe(302)
    await settle()
    expect(await db.campaignScan.count()).toBe(0)
  })

  it('404s a source that is not on the list, or not a source at all', async () => {
    const app = await getApp()
    for (const source of ['poster', 'LID', 'lid_2', 'a'.repeat(33)]) {
      const res = await app.inject({
        method: 'GET',
        url: `/go/${source}`,
        headers: { 'user-agent': PHONE },
      })
      expect(res.statusCode).toBe(404)
    }
    await settle()
    expect(await db.campaignScan.count()).toBe(0)
  })
})

describe('GET /admin/scans', () => {
  it('is for moderators only', async () => {
    const app = await getApp()
    expect((await app.inject({ method: 'GET', url: '/admin/scans?source=lid' })).statusCode).toBe(
      401
    )
    const student = await createUser()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/scans?source=lid',
      cookies: await cookieFor(student),
    })
    expect(res.statusCode).toBe(403)
  })

  it('counts scans, distinct visitors and scans per day', async () => {
    const today = new Date()
    const twoDaysAgo = new Date(today.getTime() - 2 * 86_400_000)
    const longAgo = new Date(today.getTime() - 60 * 86_400_000)
    await db.campaignScan.createMany({
      data: [
        { source: 'lid', visitorHash: 'a', createdAt: today },
        { source: 'lid', visitorHash: 'a', createdAt: today },
        { source: 'lid', visitorHash: 'b', createdAt: twoDaysAgo },
        { source: 'lid', visitorHash: 'c', createdAt: longAgo },
        { source: 'other', visitorHash: 'd', createdAt: today },
      ],
    })
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/scans?source=lid',
      cookies: await cookieFor(admin),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ source: 'lid', total: 4, uniqueVisitors: 3 })
    expect(body.days).toHaveLength(30)
    const day = (d: Date) =>
      body.days.find((x: { date: string }) => x.date === d.toISOString().slice(0, 10))
    expect(day(today)).toEqual({
      date: today.toISOString().slice(0, 10),
      scans: 2,
      uniqueVisitors: 1,
    })
    expect(day(twoDaysAgo)).toMatchObject({ scans: 1, uniqueVisitors: 1 })
    expect(body.days.reduce((n: number, d: { scans: number }) => n + d.scans, 0)).toBe(3)
  })

  it('refuses an unknown source', async () => {
    const admin = await createUser({ isAdmin: true })
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/scans?source=poster',
      cookies: await cookieFor(admin),
    })
    expect(res.statusCode).toBe(400)
  })
})
