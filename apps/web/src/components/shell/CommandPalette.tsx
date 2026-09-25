import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { GITHUB_URL } from '../../lib/site'
import { useTheme } from '../../lib/theme'
import { Icon, type IconName } from '../ui'

type Command = {
  id: string
  label: string
  hint?: string
  icon: IconName
  group: string
  run: () => void
}

/**
 * ⌘K / Ctrl+K: search projects, jump to any page, flip the theme. Arrow keys
 * move, Enter runs, Escape closes.
 */
export function CommandPalette() {
  const { commandOpen, setCommandOpen, darkMode, setDarkMode } = useTheme()
  const close = useCallback(() => setCommandOpen(false), [setCommandOpen])
  if (!commandOpen) return null
  return <Palette close={close} darkMode={darkMode} setDarkMode={setDarkMode} />
}

function Palette({
  close,
  darkMode,
  setDarkMode,
}: {
  close: () => void
  darkMode: boolean
  setDarkMode: (d: boolean) => void
}) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [cursor, setCursor] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  // One search per pause in typing, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data: projects = [] } = useQuery({
    queryKey: ['command-search', debounced],
    queryFn: () => api.projects.list({ search: debounced, take: 6 }),
    enabled: debounced.length > 1,
  })

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      close()
      navigate(to)
    }
    const pages: Command[] = [
      { id: 'home', label: 'Home', icon: 'home', group: 'Pages', run: go('/') },
      { id: 'explore', label: 'Explore', icon: 'compass', group: 'Pages', run: go('/explore') },
      {
        id: 'post',
        label: 'Post a project',
        icon: 'plus',
        group: 'Pages',
        run: go(user ? '/projects/new' : '/session'),
      },
      ...(user
        ? [
            {
              id: 'me',
              label: 'Your profile',
              icon: 'user' as IconName,
              group: 'Pages',
              run: go(`/u/${user.id}`),
            },
            {
              id: 'messages',
              label: 'Messages',
              icon: 'inbox' as IconName,
              group: 'Pages',
              run: go('/messages'),
            },
            {
              id: 'saved',
              label: 'Saved',
              icon: 'bookmark' as IconName,
              group: 'Pages',
              run: go('/saved'),
            },
          ]
        : []),
      {
        id: 'collections',
        label: 'Collections',
        icon: 'layers',
        group: 'Pages',
        run: go('/collections'),
      },
      { id: 'orgs', label: 'Clubs & labs', icon: 'users', group: 'Pages', run: go('/orgs') },
      {
        id: 'discover',
        label: 'Ask AI discovery',
        icon: 'sparkle',
        group: 'Pages',
        run: go('/discover'),
      },
      ...(user?.isAdmin
        ? [
            {
              id: 'admin',
              label: 'Moderation',
              icon: 'shieldCheck' as IconName,
              group: 'Pages',
              run: go('/admin'),
            },
          ]
        : []),
      { id: 'about', label: 'About', icon: 'info', group: 'Pages', run: go('/about') },
      {
        id: 'terms',
        label: 'Terms & ownership',
        icon: 'shieldCheck',
        group: 'Pages',
        run: go('/terms'),
      },
      { id: 'privacy', label: 'Privacy', icon: 'lock', group: 'Pages', run: go('/privacy') },
    ]
    const actions: Command[] = [
      {
        id: 'theme',
        label: darkMode ? 'Switch to light mode' : 'Switch to dark mode',
        icon: darkMode ? 'sun' : 'moon',
        group: 'Actions',
        run: () => {
          setDarkMode(!darkMode)
          close()
        },
      },
      {
        id: 'source',
        label: 'Source code on GitHub',
        icon: 'branch',
        group: 'Actions',
        run: () => {
          close()
          window.open(GITHUB_URL, '_blank', 'noopener')
        },
      },
      user
        ? {
            id: 'signout',
            label: 'Sign out',
            icon: 'logout',
            group: 'Actions',
            run: async () => {
              close()
              await logout()
              navigate('/')
            },
          }
        : { id: 'signin', label: 'Sign in', icon: 'user', group: 'Actions', run: go('/session') },
    ]
    const results: Command[] = projects.map((p) => ({
      id: p.id,
      label: p.title,
      hint: p.owner?.name,
      icon: 'layers',
      group: 'Projects',
      run: go(`/projects/${p.id}`),
    }))

    const q = query.trim().toLowerCase()
    const matches = (c: Command) => !q || c.label.toLowerCase().includes(q)
    return [...results, ...pages.filter(matches), ...actions.filter(matches)]
  }, [query, projects, darkMode, user, close, navigate, logout, setDarkMode])

  // A new query starts the highlight back at the top.
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setCursor(0)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(c + 1, commands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        commands[cursor]?.run()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [commands, cursor, close])

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  let lastGroup = ''

  return createPortal(
    <div className="scrim scrim--top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="dialog card palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command panel"
      >
        <div className="palette__search">
          <Icon name="search" size={20} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, jump to a page…"
            aria-label="Search commands"
          />
          <kbd className="searchbox__kbd">ESC</kbd>
        </div>
        <div className="palette__list" ref={list} role="listbox">
          {commands.length === 0 && <p className="muted palette__empty">No matches.</p>}
          {commands.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <div key={`${c.group}-${c.id}`}>
                {header && <div className="palette__group lbl">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  data-active={i === cursor}
                  className="palette__item"
                  onMouseEnter={() => setCursor(i)}
                  onClick={c.run}
                >
                  <Icon name={c.icon} size={18} />
                  <span className="grow clamp-1">{c.label}</span>
                  {c.hint && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {c.hint}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
