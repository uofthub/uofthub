import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUI } from '../../lib/ui'
import { Chip, Dialog, Icon, cx } from '../ui'
import { navSections, type NavItem } from './nav'

type Command = { id: string; label: string; hint?: string; icon: string; run: () => void; group: string }

/** ⌘/Ctrl + K palette — the CommandModal from uoftindex.ca. */
export default function CommandModal() {
  const { commandModal, setCommandModal, darkMode, setDarkMode } = useUI()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const { data: projects = [] } = useQuery({
    queryKey: ['command-search', query],
    queryFn: () => api.projects.list({ search: query }),
    enabled: commandModal && query.trim().length > 1,
  })

  const close = () => {
    setCommandModal(false)
    setQuery('')
    setCursor(0)
  }

  const commands = useMemo<Command[]>(() => {
    const open = (item: NavItem) => () => {
      close()
      if (item.internal) navigate(item.link)
      else window.open(item.link, '_blank')?.focus()
    }

    const pages: Command[] = navSections.flatMap(section =>
      section.options.map(item => ({
        id: item.link,
        label: item.page,
        icon: item.icon,
        group: section.heading || 'Pages',
        run: open(item),
      })),
    )

    const actions: Command[] = [
      {
        id: 'theme',
        label: darkMode ? 'Switch to light mode' : 'Switch to dark mode',
        icon: darkMode ? 'mdi-white-balance-sunny' : 'mdi-weather-night',
        group: 'Actions',
        run: () => {
          setDarkMode(!darkMode)
          close()
        },
      },
      {
        id: 'home',
        label: 'Go home',
        icon: 'mdi-home-outline',
        group: 'Actions',
        run: () => {
          close()
          navigate('/')
        },
      },
    ]

    const results: Command[] = projects.slice(0, 6).map(p => ({
      id: p.id,
      label: p.title,
      hint: p.owner?.name,
      icon: 'mdi-file-document-outline',
      group: 'Projects',
      run: () => {
        close()
        navigate(`/projects/${p.id}`)
      },
    }))

    const q = query.trim().toLowerCase()
    const matches = (c: Command) => !q || c.label.toLowerCase().includes(q)
    return [...results, ...pages.filter(matches), ...actions.filter(matches)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, projects, darkMode, navigate])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    if (!commandModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor(c => Math.min(c + 1, commands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor(c => Math.max(c - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        commands[cursor]?.run()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [commandModal, commands, cursor])

  if (!commandModal) return null

  let lastGroup = ''

  return (
    <Dialog onClose={close} maxWidth={600} align="top">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--v-border-base)' }}>
        <Icon name="mdi-magnify" size={22} color="var(--text-secondary)" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search projects, jump to a page…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--v-text-base)',
            fontSize: '1rem',
          }}
        />
        <Chip small color="grey">
          ESC
        </Chip>
      </div>

      <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '8px 0' }}>
        {commands.length === 0 && (
          <p className="text--disabled" style={{ padding: '24px', textAlign: 'center', margin: 0 }}>
            No matches.
          </p>
        )}
        {commands.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null
          lastGroup = c.group
          return (
            <div key={`${c.group}-${c.id}`}>
              {header && <div className="v-subheader">{header}</div>}
              <button
                className={cx('v-list-item')}
                style={{ background: i === cursor ? 'var(--hover-overlay)' : undefined }}
                onMouseEnter={() => setCursor(i)}
                onClick={c.run}
              >
                <Icon name={c.icon} color="var(--v-accent-base)" />
                <span style={{ flex: 1 }} className="overflow-ellipsis">
                  {c.label}
                </span>
                {c.hint && (
                  <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
                    {c.hint}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
