import { readFileSync } from 'node:fs'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import type { ProjectType } from '@prisma/client'

/**
 * Link-preview images: the 1200×630 card Discord, Slack, iMessage and search
 * results show for a shared link, drawn for projects without a cover, and for
 * profiles and groups. satori lays the card out as SVG, resvg rasterises it.
 *
 * Fonts and the mark are files in api/assets, read once at startup — the
 * Dockerfile copies that folder next to dist/. Both src/lib and dist/lib are
 * two levels below it.
 */

const asset = (name: string) => readFileSync(new URL(`../../assets/${name}`, import.meta.url))

const FONTS = [
  { name: 'Bricolage', data: asset('fonts/BricolageGrotesque-ExtraBold.ttf'), weight: 800 },
  { name: 'Instrument', data: asset('fonts/InstrumentSans-Medium.ttf'), weight: 500 },
  { name: 'Instrument', data: asset('fonts/InstrumentSans-SemiBold.ttf'), weight: 600 },
] as const

const MARK = `data:image/svg+xml;base64,${asset('uofthub-mark.svg').toString('base64')}`

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

// The app's own palette — web/src/index.css.
const INK = '#15171c'
const INK_3 = '#3d4049'
const MUTED = '#62656d'
const NAVY = '#1e3765'
const NAVY_TINT = '#e6ebf4'
const MARK_NAVY = '#002658'
const MARK_BLUE = '#0090F9'

/** The type badges' colours, as web/src/lib/projectMeta.ts has them. */
export const TYPE_BADGES: Record<ProjectType, { text: string; bg: string; ink: string }> = {
  APP: { text: 'App', bg: '#E6EBF4', ink: '#1E3765' },
  RESEARCH: { text: 'Research', bg: '#E3EEE6', ink: '#1F5B34' },
  FILM: { text: 'Film', bg: '#F6E7E1', ink: '#8A3B12' },
  DESIGN: { text: 'Design', bg: '#F3E8F4', ink: '#6B2A70' },
  AUDIO: { text: 'Music', bg: '#FBEFD0', ink: '#6B4B00' },
  HARDWARE: { text: 'Hardware', bg: '#E4EAEC', ink: '#2F4650' },
  WRITING: { text: 'Writing', bg: '#EFEDE6', ink: '#4A4538' },
  OTHER: { text: 'Other', bg: '#EFEDE6', ink: '#4A4538' },
}

type Style = Record<string, string | number>
type Node = { type: string; props: { style?: Style; children?: Child; [key: string]: unknown } }
type Child = Node | string | null | false | undefined | Child[]

/** satori reads React-shaped elements; this builds them without React. */
const h = (type: string, props: Node['props'] = {}, ...children: Child[]): Node => {
  const kept = children.filter((c) => c !== null && c !== undefined && c !== false)
  return { type, props: { ...props, children: kept.length > 1 ? kept : kept[0] } }
}

export type Badge = { text: string; bg: string; ink: string }

export type Card = {
  badge?: Badge
  title: string
  body?: string | null
  /** The line beside the wordmark — "By Ada Lovelace", "42 members". */
  footer?: string | null
  /**
   * A round picture beside the title — a profile's. `image` is a PNG or JPEG
   * data URI; without one, `initials` on a tint.
   */
  avatar?: { image?: string | null; initials: string }
}

/** Longer titles step down so three lines hold most of them. */
function titleSize(title: string): number {
  if (title.length <= 28) return 84
  if (title.length <= 56) return 68
  return 56
}

const wordmark = () =>
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 16 } },
    h('img', { src: MARK, width: 47, height: 50 }),
    h(
      'div',
      { style: { fontFamily: 'Bricolage', fontSize: 40, color: MARK_NAVY, letterSpacing: -1 } },
      'uofthub'
    )
  )

function avatarNode(avatar: NonNullable<Card['avatar']>): Node {
  const size = 168
  const round: Style = {
    width: size,
    height: size,
    borderRadius: size / 2,
    flexShrink: 0,
    objectFit: 'cover',
  }
  if (avatar.image) return h('img', { src: avatar.image, width: size, height: size, style: round })
  return h(
    'div',
    {
      style: {
        ...round,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: NAVY_TINT,
        color: NAVY,
        fontFamily: 'Bricolage',
        fontSize: 68,
      },
    },
    avatar.initials
  )
}

function cardTree(card: Card): Node {
  const text = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 24, flexGrow: 1, minWidth: 0 } },
    card.badge &&
      h(
        'div',
        { style: { display: 'flex' } },
        h(
          'div',
          {
            style: {
              background: card.badge.bg,
              color: card.badge.ink,
              fontFamily: 'Instrument',
              fontWeight: 600,
              fontSize: 26,
              padding: '8px 22px',
              borderRadius: 999,
            },
          },
          card.badge.text
        )
      ),
    h(
      'div',
      {
        style: {
          display: 'block',
          lineClamp: 3,
          fontFamily: 'Bricolage',
          fontSize: titleSize(card.title),
          lineHeight: 1.05,
          letterSpacing: -1.5,
          color: INK,
        },
      },
      card.title
    ),
    card.body &&
      h(
        'div',
        {
          style: {
            display: 'block',
            lineClamp: 2,
            fontFamily: 'Instrument',
            fontWeight: 500,
            fontSize: 32,
            lineHeight: 1.35,
            color: MUTED,
          },
        },
        card.body
      )
  )

  return h(
    'div',
    {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#ffffff',
        padding: '72px 80px 64px',
        borderBottom: `16px solid ${NAVY}`,
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 48 } },
      card.avatar && avatarNode(card.avatar),
      text
    ),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h(
        'div',
        {
          style: {
            display: 'block',
            lineClamp: 1,
            fontFamily: 'Instrument',
            fontWeight: 600,
            fontSize: 28,
            color: INK_3,
            maxWidth: 820,
          },
        },
        card.footer ?? ''
      ),
      wordmark()
    )
  )
}

/** The site's own card, for every page without one of its own. */
function siteTree(): Node {
  return h(
    'div',
    {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 72,
        background: '#ffffff',
        padding: '0 96px',
        borderBottom: `16px solid ${NAVY}`,
      },
    },
    h('img', { src: MARK, width: 282, height: 300 }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 20, flexShrink: 1 } },
      h(
        'div',
        { style: { fontFamily: 'Bricolage', fontSize: 120, color: MARK_NAVY, letterSpacing: -4 } },
        'uofthub'
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'Instrument',
            fontWeight: 500,
            fontSize: 38,
            lineHeight: 1.3,
            color: MUTED,
          },
        },
        'Everything students build at the University of Toronto.'
      ),
      h('div', { style: { width: 96, height: 10, borderRadius: 5, background: MARK_BLUE } })
    )
  )
}

async function toPng(tree: Node): Promise<Buffer> {
  const svg = await satori(tree as never, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: FONTS.map((f) => ({ ...f, style: 'normal' as const })),
  })
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng()
}

/**
 * Text the fonts can draw. They carry no emoji, which would otherwise come out
 * as empty boxes; other scripts they lack do the same, but rarely.
 */
export const drawable = (text: string) =>
  text
    .replace(/\p{Extended_Pictographic}|[\u{FE0F}\u{200D}\u{20E3}]|\p{Emoji_Modifier}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

export const renderCard = (card: Card) =>
  toPng(
    cardTree({
      ...card,
      title: drawable(card.title) || 'Untitled',
      body: card.body && drawable(card.body),
      footer: card.footer && drawable(card.footer),
    })
  )
export const renderSiteCard = () => toPng(siteTree())

/** "Ada Lovelace" → "AL"; one name → its first letter. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words
  return letters.map((w) => Array.from(w)[0]!.toUpperCase()).join('') || '?'
}

/**
 * Bytes as a data URI satori can draw, or null. It decodes PNG and JPEG only,
 * so anything else — a WebP or GIF avatar — falls back to initials rather
 * than failing the whole card.
 */
export function imageDataUri(bytes: Buffer): string | null {
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (!isPng && !isJpeg) return null
  return `data:image/${isPng ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`
}

/**
 * Rendered cards by key, so a link pasted into a busy channel — every client
 * fetching the image at once — draws it once. Keys carry the record's
 * updatedAt, so an edit is a new key rather than a stale hit.
 */
const cache = new Map<string, Buffer>()
const CACHE_MAX = 200

export async function cachedPng(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
  const hit = cache.get(key)
  if (hit) {
    // Refresh its place: Map iterates oldest-inserted first.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const png = await render()
  cache.set(key, png)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return png
}

/** Headers for a card: shared caches may keep it a day; the URL changes on edit. */
export const PNG_HEADERS = {
  'content-type': 'image/png',
  'cache-control': 'public, max-age=86400',
} as const
