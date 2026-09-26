import type { ReactNode } from 'react'
import { safeUrl } from '../lib/api'
import { cx } from './ui'

/**
 * A small CommonMark-ish renderer for uploaded .md files.
 *
 * Written by hand rather than pulled from npm because the only input it ever
 * sees is a student's README, and the alternative — a parser producing an HTML
 * string — would mean `dangerouslySetInnerHTML` over a file any signed-in user
 * can upload. Everything below builds React elements, so there is no markup
 * path for the document to inject through, and link targets still go through
 * `safeUrl` so a `javascript:` href never reaches the DOM.
 *
 * Covers what a README actually uses: headings, emphasis, code, links, lists,
 * quotes, rules and pipe tables. Anything unrecognised falls through as text.
 */

/* ---------------------------------- styles --------------------------------- */

const block = 'mb-3.5 last:mb-0'

/** Preformatted text in the document's grey well — code blocks and plain-text previews. */
export const docPre =
  'mb-3.5 overflow-x-auto rounded-btn bg-fill px-4 py-3.5 font-mono text-13 leading-[1.55] [tab-size:2] last:mb-0'

/** A ruled table that scrolls sideways rather than squeezing — pipe tables and CSV previews. */
export function DocTable({ header, rows }: { header: ReactNode[]; rows: ReactNode[][] }) {
  const cell = 'border border-line px-3 py-1.75 text-left align-top'
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-14">
        <thead>
          <tr>
            {header.map((c, n) => (
              <th key={n} className={cx(cell, 'bg-fill font-semibold whitespace-nowrap')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {header.map((_, n) => (
                <td key={n} className={cell}>
                  {row[n] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------- inline --------------------------------- */

// Ordered so the greedier forms win: code spans first (their contents are
// literal), then bold before italic, so `**x**` isn't read as two italics.
const INLINE = new RegExp(
  [
    /`([^`]+)`/.source, // 1: code
    /\*\*([^*]+)\*\*/.source, // 2: bold
    /\*([^*]+)\*|_([^_]+)_/.source, // 3/4: italic
    /\[([^\]]*)\]\(([^)\s]+)\)/.source, // 5/6: link
    /(https?:\/\/[^\s<>)]+)/.source, // 7: bare URL
  ].join('|')
)

function renderInline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let rest = text
  let i = 0

  while (rest) {
    const match = INLINE.exec(rest)
    if (!match || match.index === undefined) break

    if (match.index > 0) out.push(rest.slice(0, match.index))
    const [raw, code, bold, star, underscore, linkText, linkHref, bareUrl] = match
    const k = `${key}-${i++}`

    if (code !== undefined) {
      out.push(
        <code key={k} className="rounded-sm bg-fill px-1.25 py-px font-mono text-[0.875em]">
          {code}
        </code>
      )
    } else if (bold !== undefined) {
      out.push(<strong key={k}>{renderInline(bold, k)}</strong>)
    } else if (star !== undefined || underscore !== undefined) {
      out.push(<em key={k}>{renderInline((star ?? underscore)!, k)}</em>)
    } else if (linkHref !== undefined) {
      const href = safeUrl(linkHref)
      const label = linkText || linkHref
      out.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          <span key={k}>{label}</span>
        )
      )
    } else if (bareUrl !== undefined) {
      const href = safeUrl(bareUrl)
      out.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer">
            {bareUrl}
          </a>
        ) : (
          <span key={k}>{bareUrl}</span>
        )
      )
    }

    rest = rest.slice(match.index + raw.length)
  }

  if (rest) out.push(rest)
  return out
}

/* ---------------------------------- blocks --------------------------------- */

const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/
const NUMBERED = /^\s{0,3}\d+[.)]\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
// A pipe table's second line: | --- | :--: | and friends.
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/

const cells = (line: string) =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())

export default function Markdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let i = 0

  const key = () => `b${blocks.length}`

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    // Fenced code — taken literally, including anything that looks like markup.
    const fence = line.match(/^\s{0,3}(```|~~~)(.*)$/)
    if (fence) {
      const marker = fence[1]
      const body: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) body.push(lines[i++])
      i += 1 // closing fence, or the end of the file
      blocks.push(
        <pre key={key()} className={docPre}>
          <code>{body.join('\n')}</code>
        </pre>
      )
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      const level = Math.min(heading[1].length, 6)
      const Tag = `h${level}` as 'h1'
      blocks.push(
        <Tag
          key={key()}
          className="mt-5.5 mb-1.5 font-display leading-[1.25] font-bold text-ink first:mt-0"
          style={{ fontSize: `${1.5 - (level - 1) * 0.11}rem` }}
        >
          {renderInline(heading[2], key())}
        </Tag>
      )
      i += 1
      continue
    }

    if (RULE.test(line)) {
      blocks.push(<hr key={key()} className="my-4.5" />)
      i += 1
      continue
    }

    if (lines[i + 1] !== undefined && line.includes('|') && TABLE_RULE.test(lines[i + 1])) {
      const header = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim())
        rows.push(cells(lines[i++]))
      const k = key()
      blocks.push(
        <DocTable
          key={k}
          header={header.map((c, n) => renderInline(c, `${k}-h${n}`))}
          rows={rows.map((row, r) =>
            header.map((_, n) => renderInline(row[n] ?? '', `${k}-${r}-${n}`))
          )}
        />
      )
      continue
    }

    const quoted = line.match(QUOTE)
    if (quoted) {
      const body: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(QUOTE)
        if (!m) break
        body.push(m[1])
        i += 1
      }
      blocks.push(
        <blockquote
          key={key()}
          className={cx(block, 'border-l-3 border-line py-1 pl-4 text-ink-3')}
        >
          {renderInline(body.join(' '), key())}
        </blockquote>
      )
      continue
    }

    const listPattern = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null
    if (listPattern) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(listPattern)
        if (!m) break
        items.push(m[1])
        i += 1
      }
      const Tag = listPattern === BULLET ? 'ul' : 'ol'
      blocks.push(
        <Tag
          key={key()}
          className={cx(block, 'pl-5.5', Tag === 'ul' ? 'list-disc' : 'list-decimal')}
        >
          {items.map((item, n) => (
            <li key={n} className="mb-1">
              {renderInline(item, `${key()}-${n}`)}
            </li>
          ))}
        </Tag>
      )
      continue
    }

    // Paragraph: everything up to the next blank line — or up to the next block
    // that starts without one, which is how most READMEs write their lists.
    const startsBlock = (l: string) =>
      HEADING.test(l) || RULE.test(l) || QUOTE.test(l) || BULLET.test(l) || NUMBERED.test(l)
    const paragraph: string[] = [lines[i++]]
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) paragraph.push(lines[i++])
    blocks.push(
      <p key={key()} className={block}>
        {renderInline(paragraph.join(' '), key())}
      </p>
    )
  }

  return <div className="text-16 leading-[1.65] text-ink-2">{blocks}</div>
}
