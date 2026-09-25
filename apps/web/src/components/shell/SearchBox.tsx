import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTheme } from '../../lib/theme'
import { Icon } from '../ui'

/** True when a keystroke belongs to something the student is typing into. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

/**
 * The header's search. Enter runs it on Explore; `/` from anywhere focuses it,
 * which is what the key hint inside it promises.
 */
export function SearchBox() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(pathname === '/explore' ? (params.get('q') ?? '') : '')
  const input = useRef<HTMLInputElement>(null)
  const { setCommandOpen } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !typing(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <form
      role="search"
      className="searchbox"
      onSubmit={(e) => {
        e.preventDefault()
        const q = query.trim()
        navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore')
        input.current?.blur()
      }}
    >
      <Icon name="search" size={18} />
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search projects, people or a course code like CSC209"
        aria-label="Search uofthub"
      />
      <kbd className="searchbox__kbd" aria-hidden="true">
        /
      </kbd>
      <button
        type="button"
        className="searchbox__kbd searchbox__cmd"
        onClick={() => setCommandOpen(true)}
        title="Command panel"
        aria-label="Open the command panel"
      >
        ⌘K
      </button>
    </form>
  )
}
