import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import { derivedKey } from './keys.js'

/**
 * Printed QR codes and the scans they bring in (GET /go/:source).
 *
 * Every sticker or poster gets a source name, and only names listed here are
 * recorded — anything else is a 404, so a typo'd or made-up /go/whatever
 * can't fill the table with junk rows.
 */
export const CAMPAIGN_SOURCES = ['lid'] as const

export const campaignSource = z
  .string()
  .max(32)
  .regex(/^[a-z0-9-]+$/)
  .refine((source) => (CAMPAIGN_SOURCES as readonly string[]).includes(source))

/**
 * Crawlers and link-preview fetchers. A QR code is only ever opened by a phone
 * camera, but the same URL pasted into a chat gets fetched by the chat's
 * preview bot, which is not somebody scanning a sticker. An empty user agent
 * is no browser either.
 */
const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|skype|linkedin|pinterest|embedly|vkshare|quora link|headless|lighthouse|curl|wget|python|go-http-client|okhttp|axios|node-fetch|java\//i

export const isBot = (userAgent: string | undefined): boolean => !userAgent || BOT.test(userAgent)

/**
 * The salt for one UTC day: the server's own secret (derived from JWT_SECRET,
 * see keys.ts) mixed with the date. It is never stored, so once the day is
 * over nothing can recompute that day's hashes — an IP can't be confirmed by
 * hashing it again, and the same person's scans on two days don't match.
 */
export function dailySalt(now = new Date()): string {
  const day = now.toISOString().slice(0, 10)
  return createHmac('sha256', derivedKey('campaign-salt-v1')).update(day).digest('hex')
}

/** sha256(ip + userAgent + DAILY_SALT): the same person, today only. */
export function visitorHash(ip: string, userAgent: string, now = new Date()): string {
  return createHash('sha256')
    .update(`${ip}\n${userAgent}\n${dailySalt(now)}`)
    .digest('hex')
}
