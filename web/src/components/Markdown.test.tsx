import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Markdown from './Markdown'

/**
 * The markdown renderer is written by hand rather than pulled from npm, so it
 * has no upstream test suite standing behind it. The security properties at
 * the bottom are the reason it exists in that form at all.
 */

const html = (source: string) => render(<Markdown source={source} />).container

describe('block structure', () => {
  it('renders headings at the right level', () => {
    const c = html('# One\n\n### Three')
    expect(c.querySelector('h1')).toHaveTextContent('One')
    expect(c.querySelector('h3')).toHaveTextContent('Three')
  })

  it('caps heading depth at six, and treats a seventh hash as prose', () => {
    expect(html('###### Six').querySelector('h6')).toHaveTextContent('Six')
    // CommonMark agrees: seven hashes is not a heading.
    const seven = html('####### Seven')
    expect(seven.querySelector('h6')).not.toBeInTheDocument()
    expect(seven.querySelector('p')).toHaveTextContent('####### Seven')
  })

  it('joins soft-wrapped lines into one paragraph', () => {
    const c = html('one\ntwo\n\nthree')
    const paragraphs = c.querySelectorAll('p')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]).toHaveTextContent('one two')
  })

  it('starts a list even when no blank line precedes it', () => {
    const c = html('Intro:\n- first\n- second')
    expect(c.querySelector('p')).toHaveTextContent('Intro:')
    expect(c.querySelectorAll('ul li')).toHaveLength(2)
  })

  it('tells an ordered list from a bullet list', () => {
    expect(html('1. a\n2. b').querySelector('ol')).toBeInTheDocument()
    expect(html('- a\n- b').querySelector('ul')).toBeInTheDocument()
  })

  it('reads --- as a rule, not a bullet', () => {
    const c = html('above\n\n---\n\nbelow')
    expect(c.querySelector('hr')).toBeInTheDocument()
    expect(c.querySelector('ul')).not.toBeInTheDocument()
  })

  it('renders a blockquote', () => {
    expect(html('> quoted\n> still quoted').querySelector('blockquote')).toHaveTextContent('quoted still quoted')
  })

  it('renders a pipe table with a header row', () => {
    const c = html('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(c.querySelectorAll('thead th')).toHaveLength(2)
    expect(c.querySelectorAll('tbody td')).toHaveLength(2)
  })

  it('pads a short table row rather than dropping the column', () => {
    const c = html('| a | b |\n| --- | --- |\n| 1 |')
    expect(c.querySelectorAll('tbody td')).toHaveLength(2)
  })
})

describe('inline formatting', () => {
  it('renders bold and italic', () => {
    const c = html('**bold** and *italic* and _also_')
    expect(c.querySelector('strong')).toHaveTextContent('bold')
    expect(c.querySelectorAll('em')).toHaveLength(2)
  })

  it('reads ** as bold rather than two italics', () => {
    const c = html('**bold**')
    expect(c.querySelector('strong')).toHaveTextContent('bold')
    expect(c.querySelector('em')).not.toBeInTheDocument()
  })

  it('renders inline code', () => {
    expect(html('use `npm run dev` here').querySelector('code')).toHaveTextContent('npm run dev')
  })

  it('takes a fenced block literally, formatting markers and all', () => {
    const c = html('```\n**not bold**\n# not a heading\n```')
    expect(c.querySelector('pre code')).toHaveTextContent('**not bold** # not a heading')
    expect(c.querySelector('strong')).not.toBeInTheDocument()
    expect(c.querySelector('h1')).not.toBeInTheDocument()
  })

  it('closes an unterminated fence at the end of the file', () => {
    expect(html('```\nstill code').querySelector('pre')).toHaveTextContent('still code')
  })

  it('links markdown links and bare URLs, opening them safely', () => {
    const c = html('[docs](https://example.com) and https://plain.example.com')
    const links = c.querySelectorAll('a')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', 'https://example.com/')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
    expect(links[0]).toHaveAttribute('target', '_blank')
  })

  it('leaves text with no markup alone', () => {
    expect(html('just words').querySelector('p')).toHaveTextContent('just words')
  })
})

describe('untrusted input', () => {
  it('renders HTML in the source as text, never as markup', () => {
    const c = html('<img src=x onerror="alert(1)"> <script>alert(2)</script>')
    expect(c.querySelector('img')).not.toBeInTheDocument()
    expect(c.querySelector('script')).not.toBeInTheDocument()
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument()
  })

  it('refuses a javascript: link, keeping the label as plain text', () => {
    const c = html('[click me](javascript:alert(1))')
    expect(c.querySelector('a')).not.toBeInTheDocument()
    expect(c).toHaveTextContent('click me')
  })

  it('refuses a data: link', () => {
    const c = html('[x](data:text/html,<script>alert(1)</script>)')
    expect(c.querySelector('a')).not.toBeInTheDocument()
  })

  it('terminates on input that is only punctuation', () => {
    expect(() => html('*** ___ ``` ~~~ ||| >>>')).not.toThrow()
  })

  it('terminates on an unclosed emphasis marker', () => {
    expect(() => html('**never closed and *neither is this')).not.toThrow()
  })
})
