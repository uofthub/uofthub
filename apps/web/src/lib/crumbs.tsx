import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { Crumb } from '../components/ui'

/**
 * Breadcrumb trail shown in the app bar — the equivalent of
 * `store.app.pageCrumbs` on uoftindex.ca. Pages call `usePageCrumbs()` to
 * publish their own trail; otherwise one is derived from the URL.
 */
const CrumbsContext = createContext<{
  crumbs: Crumb[] | null
  setCrumbs: (c: Crumb[] | null) => void
}>({ crumbs: null, setCrumbs: () => {} })

export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null)
  return <CrumbsContext.Provider value={{ crumbs, setCrumbs }}>{children}</CrumbsContext.Provider>
}

/** Publish a breadcrumb trail for the current page. */
export function usePageCrumbs(items: Crumb[]) {
  const { setCrumbs } = useContext(CrumbsContext)
  const key = JSON.stringify(items)
  useEffect(() => {
    setCrumbs(JSON.parse(key) as Crumb[])
    return () => setCrumbs(null)
  }, [key, setCrumbs])
}

const FALLBACK_LABELS: Record<string, string> = {
  projects: 'Projects',
  discover: 'Discover',
  orgs: 'Clubs & Labs',
  courses: 'Tags',
  about: 'About',
  u: 'People',
  new: 'Share a project',
}

/** The trail to render: the page's own, or one derived from the path. */
export function useCrumbs(): Crumb[] {
  const { crumbs } = useContext(CrumbsContext)
  const { pathname } = useLocation()
  if (crumbs) return [{ text: 'Home', href: '/' }, ...crumbs]

  const segments = pathname.split('/').filter(Boolean)
  return [
    { text: 'Home', href: '/' },
    ...segments.map((seg, i) => ({
      text: FALLBACK_LABELS[seg] ?? decodeURIComponent(seg),
      href: '/' + segments.slice(0, i + 1).join('/'),
    })),
  ]
}
