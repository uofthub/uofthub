import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { enrichImport, type Enriched } from './linkEnrich.js'

/**
 * "Start from a link": read a page a student pasted and fill in the post form.
 *
 * This is the one place the API fetches a URL a user chose, which makes it the
 * one place somebody can point the server at itself — at the database, at a
 * cloud metadata endpoint, at anything on the private network. So:
 *
 *   - Every hostname is resolved by `safeLookup`, which refuses the connection
 *     if *any* address it resolves to is private, loopback, link-local or
 *     otherwise not on the public internet. The check happens at connect time,
 *     on the address actually dialled, so a DNS answer that changes between a
 *     check and the connection (rebinding) cannot slip through.
 *   - An IP literal skips DNS, so it is checked directly.
 *   - Only http and https, only the default ports, at most three redirects —
 *     each hop re-checked the same way — a short timeout and a byte cap.
 *
 * What comes back is only ever text for the form and an image the student
 * then uploads as their cover through the normal validated upload.
 *
 * A page's metadata only covers a title, a summary and a picture, so what it
 * read — metadata plus the page's text, or a repo's README — then goes to
 * lib/linkEnrich.ts, which fills the type, status, tags, write-up and details
 * when AI is configured. Without it the import is the metadata alone.
 */

export class ImportError extends Error {}

const TIMEOUT_MS = 6000
const MAX_REDIRECTS = 3
const HTML_MAX_BYTES = 768 * 1024
const JSON_MAX_BYTES = 256 * 1024
const README_MAX_BYTES = 64 * 1024
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024
const USER_AGENT = 'uofthub-link-import/1.0 (+https://uofthub.com)'

const TITLE_MAX = 120
const PITCH_MAX = 280
const DESCRIPTION_MAX = 20_000
const TAGS_MAX = 10
const TAG_MAX = 40

// ── Address checks ────────────────────────────────────────────────────────────

const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  // Also covers ::1 and the deprecated IPv4-compatible range (::127.0.0.1).
  ['::', 96],
  ['::1', 128],
  // No rule for IPv4-mapped (::ffff:0:0/96): BlockList already checks a
  // mapped address, however it is written, against the IPv4 rules above —
  // and a rule for the whole range would match every IPv4 address too.
  // NAT64, well-known and local-use: a gateway translating to IPv4 inside.
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  // Tunnels that embed an IPv4 address: 6to4 and Teredo.
  ['2002::', 16],
  ['2001::', 32],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(net, prefix, 'ipv6')

/** True for an address on the public internet. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, 'ipv4')
  if (family === 6) {
    // An IPv4-mapped address (::ffff:10.0.0.1) is the IPv4 address in disguise.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
    if (mapped) return isPublicAddress(mapped[1])
    return !blocked.check(address, 'ipv6')
  }
  return false
}

/** A `lookup` for http(s).request that only ever connects to public addresses. */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, '', 0)
    if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address)))
      return callback(new ImportError('That address is not on the public internet'), '', 0)
    if (options.all)
      return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

/** Parse and vet a URL before anything is fetched. */
export function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ImportError('That is not a link')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new ImportError('Only http and https links can be imported')
  if (url.username || url.password)
    throw new ImportError('Links with a password cannot be imported')
  if (url.port && url.port !== '80' && url.port !== '443')
    throw new ImportError('Only links on the standard ports can be imported')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && !isPublicAddress(host))
    throw new ImportError('That address is not on the public internet')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    throw new ImportError('That address is not on the public internet')
  return url
}

// ── Fetching ──────────────────────────────────────────────────────────────────

type Fetched = { url: URL; contentType: string; body: Buffer; truncated: boolean }

function getOnce(
  url: URL,
  headers: Record<string, string>,
  maxBytes: number
): Promise<Fetched | { redirect: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const req = client.get(
      url,
      {
        headers: { 'user-agent': USER_AGENT, ...headers },
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        // No connection reuse: every request goes through safeLookup afresh.
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          return resolve({ redirect: res.headers.location })
        }
        if (status < 200 || status >= 300) {
          res.resume()
          return reject(new ImportError(`That page answered ${status}`))
        }
        const chunks: Buffer[] = []
        let size = 0
        let truncated = false
        res.on('data', (chunk: Buffer) => {
          if (truncated) return
          size += chunk.length
          if (size > maxBytes) {
            truncated = true
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)))
            res.destroy()
            return finish()
          }
          chunks.push(chunk)
        })
        let done = false
        const finish = () => {
          if (done) return
          done = true
          resolve({
            url,
            contentType: String(res.headers['content-type'] ?? '').toLowerCase(),
            body: Buffer.concat(chunks),
            truncated,
          })
        }
        res.on('end', finish)
        res.on('error', (e) => (truncated ? undefined : reject(e)))
      }
    )
    const tooSlow = () => req.destroy(new ImportError('That page took too long to answer'))
    // `timeout` above is an idle timeout: every byte resets it, so a server
    // dripping one byte a second would hold this open for days. This is the
    // whole request's deadline, however the bytes arrive.
    const deadline = setTimeout(tooSlow, TIMEOUT_MS)
    req.on('close', () => clearTimeout(deadline))
    req.on('timeout', tooSlow)
    req.on('error', (e) => {
      clearTimeout(deadline)
      reject(e instanceof ImportError ? e : new ImportError('That page could not be reached'))
    })
  })
}

/** GET with redirects, each hop vetted like the first. */
export async function safeGet(
  raw: string | URL,
  { headers = {}, maxBytes }: { headers?: Record<string, string>; maxBytes: number }
): Promise<Fetched> {
  let url = checkUrl(String(raw))
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await getOnce(url, headers, maxBytes)
    if (!('redirect' in res)) return res
    url = checkUrl(new URL(res.redirect, url).toString())
  }
  throw new ImportError('That link redirects too many times')
}

// ── Reading a page ────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const clean = (s: string | undefined, max: number) => {
  const text = decodeEntities(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** The title, description and image a page advertises about itself. */
export function readPageMeta(html: string, base: URL) {
  const meta = new Map<string, string>()
  // article:tag is the one key a page repeats, once per tag.
  const articleTags: string[] = []
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {}
    for (const a of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g))
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? ''
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase()
    if (key === 'article:tag' && attrs.content) articleTags.push(attrs.content)
    if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content)
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]

  const title = clean(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, TITLE_MAX)
  const pitch = clean(
    meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'),
    PITCH_MAX
  )
  let image: string | undefined
  const rawImage = meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image')
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage.trim()), base)
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:')
        image = resolved.toString()
    } catch {
      // A malformed image URL just means no cover.
    }
  }
  const seen = new Set<string>()
  const tags = [...articleTags, ...(meta.get('keywords') ?? '').split(',')]
    .map((t) => clean(t, Infinity)?.toLowerCase())
    .filter((t): t is string => !!t && t.length <= TAG_MAX && !seen.has(t) && !!seen.add(t))
    .slice(0, TAGS_MAX)
  return { title, pitch, image, tags }
}

const BLOCK_TAGS =
  /<\/?(?:p|div|section|article|main|aside|h[1-6]|li|ul|ol|tr|td|th|table|br|hr|blockquote|pre|figure|figcaption|dt|dd)\b[^>]*>/gi

/**
 * The words a person would read on the page, for the AI fill-in: no scripts,
 * no styles, no navigation or footer, one line per block. Structured data a
 * page embeds (JSON-LD) is kept, since a page built in the browser often has
 * little else in its HTML.
 */
export function readPageText(html: string, max = 4_000): string {
  const jsonLd = [
    ...html.matchAll(
      /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi
    ),
  ]
    .map((m) => m[1].trim())
    .join('\n')
    .slice(0, 1000)
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const text = decodeEntities(
    body
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|svg|template|nav|footer|iframe|form)\b[\s\S]*?<\/\1>/gi, '')
      .replace(BLOCK_TAGS, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  // The structured data is kept whole and the text gives way, since for a page
  // built in the browser it is the only description there is.
  const data = jsonLd && `\n\nStructured data:\n${jsonLd}`
  return (text.slice(0, Math.max(0, max - data.length)) + data).trim().slice(0, max)
}

// ── GitHub ────────────────────────────────────────────────────────────────────

/** owner/repo for a github.com repository link, else null. */
export function githubRepo(url: URL): { owner: string; repo: string } | null {
  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null
  const [owner, repo] = url.pathname.split('/').filter(Boolean)
  if (!owner || !repo) return null
  const valid = /^[A-Za-z0-9_.-]+$/
  if (!valid.test(owner) || !valid.test(repo)) return null
  return { owner, repo: repo.replace(/\.git$/, '') }
}

export type Imported = {
  url: string
  title?: string
  pitch?: string
  description?: string
  type?: NonNullable<Enriched['type']>
  status?: NonNullable<Enriched['status']>
  tags: string[]
  details: { label: string; value: string }[]
  links: { label: string; url: string }[]
  image?: { name: string; contentType: string; dataBase64: string }
  /** True when AI filled in any of it, so the form can ask for a check. */
  ai: boolean
}

/** What a link's own data says, and the text the AI fill-in reads. */
type Read = { imported: Imported; text?: string }

async function fromGithub(owner: string, repo: string, url: URL): Promise<Read | null> {
  const api = `https://api.github.com/repos/${owner}/${repo}`
  let info: {
    name?: string
    description?: string | null
    homepage?: string | null
    topics?: string[]
    html_url?: string
  }
  try {
    const res = await safeGet(api, {
      headers: { accept: 'application/vnd.github+json' },
      maxBytes: JSON_MAX_BYTES,
    })
    info = JSON.parse(res.body.toString('utf8'))
  } catch {
    // Rate-limited or private: fall back to reading the page like any other.
    return null
  }

  let description: string | undefined
  try {
    const readme = await safeGet(`${api}/readme`, {
      headers: { accept: 'application/vnd.github.raw' },
      maxBytes: README_MAX_BYTES,
    })
    description = readme.body.toString('utf8').slice(0, DESCRIPTION_MAX).trim() || undefined
  } catch {
    // No README is fine.
  }

  const repoUrl = info.html_url ?? url.toString()
  const links = [{ label: 'Source code', url: repoUrl }]
  const homepage = info.homepage?.trim()
  if (homepage) {
    try {
      const home = checkUrl(homepage)
      links.unshift({ label: 'Live demo', url: home.toString() })
    } catch {
      // A homepage we would not fetch is still not one we will link.
    }
  }

  return {
    imported: {
      url: repoUrl,
      title: clean(info.name, TITLE_MAX),
      pitch: clean(info.description ?? undefined, PITCH_MAX),
      description,
      // A repository is usually software; the AI fill-in can say otherwise.
      type: 'APP',
      tags: (info.topics ?? []).slice(0, 8),
      details: [],
      links,
      image: await fetchImage(`https://opengraph.githubassets.com/1/${owner}/${repo}`),
      ai: false,
    },
    text: description,
  }
}

// ── Cover image ───────────────────────────────────────────────────────────────

// No SVG: it can carry script, and a cover is shown on every card.
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

async function fetchImage(url: string | undefined): Promise<Imported['image']> {
  if (!url) return undefined
  try {
    const res = await safeGet(url, { headers: { accept: 'image/*' }, maxBytes: IMAGE_MAX_BYTES })
    const type = res.contentType.split(';')[0].trim()
    const ext = IMAGE_TYPES[type]
    if (!ext || res.truncated || res.body.length === 0) return undefined
    return { name: `cover.${ext}`, contentType: type, dataBase64: res.body.toString('base64') }
  } catch {
    // A missing cover never fails the import.
    return undefined
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

/** Everything the post form can be pre-filled with from one link. */
export async function importFromLink(
  raw: string,
  { userId, fill = true }: { userId: string; fill?: boolean }
): Promise<Imported> {
  const read = await readLink(checkUrl(raw))
  const ai = fill
    ? await enrichImport(
        {
          url: read.imported.url,
          title: read.imported.title,
          pitch: read.imported.pitch,
          description: read.imported.description,
          tags: read.imported.tags,
          text: read.text,
        },
        userId
      )
    : null
  const imported = mergeEnriched(read.imported, ai)
  if (!imported.title && !imported.pitch)
    throw new ImportError('That page does not say anything about itself')
  return imported
}

async function readLink(url: URL): Promise<Read> {
  const repo = githubRepo(url)
  if (repo) {
    const fromRepo = await fromGithub(repo.owner, repo.repo, url)
    if (fromRepo) return fromRepo
  }

  const page = await safeGet(url, {
    headers: { accept: 'text/html,application/xhtml+xml' },
    maxBytes: HTML_MAX_BYTES,
  })
  if (!/html|xml/.test(page.contentType))
    throw new ImportError('That link is not a web page — attach it as a link instead')

  const html = page.body.toString('utf8')
  const { title, pitch, image, tags } = readPageMeta(html, page.url)
  const text = readPageText(html)
  if (!title && !pitch && !text)
    throw new ImportError('That page does not say anything about itself')

  return {
    imported: {
      url: page.url.toString(),
      title,
      pitch,
      tags,
      details: [],
      links: [{ label: repo ? 'Source code' : 'Website', url: page.url.toString() }],
      image: await fetchImage(image),
      ai: false,
    },
    text,
  }
}

/**
 * The page's own words where it has them — its summary, a README — and the AI
 * fill-in for what it leaves out. The title is the exception: a page's title
 * usually carries the site's name ("Seatfinder | Devpost"), which the AI drops.
 */
export function mergeEnriched(base: Imported, ai: Enriched | null): Imported {
  if (!ai) return base
  const seen = new Set<string>()
  const tags = [...base.tags, ...ai.tags]
    .filter((t) => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
    .slice(0, TAGS_MAX)
  return {
    ...base,
    title: ai.title ?? base.title,
    pitch: base.pitch ?? ai.pitch ?? undefined,
    description: base.description ?? ai.description ?? undefined,
    type: ai.type ?? base.type,
    status: ai.status ?? base.status,
    tags,
    details: [...base.details, ...ai.details],
    ai: true,
  }
}
