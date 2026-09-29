import { useEffect, useRef } from 'react'
import { Button } from './Button'

type PagedQuery = { fetchNextPage: () => unknown; isFetchingNextPage: boolean }

/**
 * The centred button under a paged list that fetches its next page. Takes the
 * infinite query itself, so every list says "Loading…" the same way.
 *
 * `auto` fetches the next page on its own as the button nears the screen — the
 * home feed's endless scroll. The button stays as the fallback for a browser
 * without IntersectionObserver, and for keyboard users.
 */
export function LoadMore({
  query,
  label = 'Show more',
  auto = false,
}: {
  query: PagedQuery
  label?: string
  auto?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(query)
  useEffect(() => {
    latest.current = query
  })

  useEffect(() => {
    const el = ref.current
    if (!auto || !el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !latest.current.isFetchingNextPage)
          latest.current.fetchNextPage()
      },
      // Start a screen early, so the next page is there before the bottom is.
      { rootMargin: '0px 0px 800px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [auto])

  return (
    <div ref={ref} className="flex items-center justify-center">
      <Button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
        {query.isFetchingNextPage ? 'Loading…' : label}
      </Button>
    </div>
  )
}
