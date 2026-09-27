import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useAuth } from './auth'

/** The home page's title, and index.html's — what a search result shows for the site. */
const SITE_TITLE = 'uofthub · Student projects at the University of Toronto'

/** Sets the tab title while a page is mounted. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · uofthub` : SITE_TITLE
  }, [title])
}

/**
 * Moves the address bar to where the page lives now — an old /u/:id or
 * /projects/:id link, a handle or title since changed, /@Ada for /@ada — once
 * the page knows. Replaces rather than pushes, so Back doesn't bounce.
 */
export function useCanonicalPath(path: string | undefined) {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (path && path !== pathname) navigate(`${path}${search}${hash}`, { replace: true })
  }, [path, pathname, search, hash, navigate])
}

/**
 * The phone breakpoint the Mobile feed board is drawn at: below Tailwind's
 * `md` (index.css), so `max-md:` and this always agree.
 */
export const PHONE = '(width < 45rem)'

/** Whether a media query matches, kept current as the window resizes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia?.(query)
      list?.addEventListener('change', notify)
      return () => list?.removeEventListener('change', notify)
    },
    () => !!window.matchMedia?.(query).matches,
    () => false
  )
}

/**
 * True once the element has scrolled near the viewport, and stays true.
 *
 * For per-card requests the list payload cannot answer (reaction counts): a
 * feed page renders twenty cards, and only the ones somebody scrolls to should
 * cost a round trip each.
 */
export function useInView<T extends Element>(margin = '300px') {
  const ref = useRef<T>(null)
  // Without an observer (old browsers, the test DOM) there is no way to wait,
  // so the row counts as seen from the start.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [seen, margin])

  return [ref, seen] as const
}

/**
 * Whether the viewer follows someone, and a toggle for it. Inert for a
 * signed-out viewer and for the viewer's own id.
 */
export function useFollow(userId: string | undefined) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const enabled = !!user && !!userId && user.id !== userId

  const { data } = useQuery({
    queryKey: ['follow', userId],
    queryFn: () => api.users.followingMe(userId!),
    enabled,
  })

  const toggle = useMutation({
    mutationFn: () => api.users.follow(userId!),
    onSuccess: (res) => {
      qc.setQueryData(['follow', userId], res)
      qc.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })

  return {
    canFollow: enabled,
    following: !!data?.following,
    toggle: () => toggle.mutate(),
    pending: toggle.isPending,
  }
}

/**
 * Revokes local object URLs (`blob:`) once the page stops showing them —
 * replaced, removed, or the component gone. An object URL holds its image in
 * memory until revoked. Only a URL that was passed in on an earlier render is
 * ever revoked, so one made a moment ago and still on its way in is safe.
 */
export function useReleasedObjectUrls(urls: (string | undefined)[]) {
  const shown = useRef(new Set<string>())
  useEffect(() => {
    const now = new Set(urls.flatMap((u) => (u?.startsWith('blob:') ? [u] : [])))
    for (const url of shown.current) if (!now.has(url)) URL.revokeObjectURL(url)
    shown.current = now
  })
  useEffect(() => {
    const last = shown
    return () => {
      for (const url of last.current) URL.revokeObjectURL(url)
      last.current = new Set()
    }
  }, [])
}
