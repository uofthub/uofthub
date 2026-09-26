import { Button } from './Button'

/**
 * The centred button under a paged list that fetches its next page. Takes the
 * infinite query itself, so every list says "Loading…" the same way.
 */
export function LoadMore({
  query,
  label = 'Show more',
}: {
  query: { fetchNextPage: () => unknown; isFetchingNextPage: boolean }
  label?: string
}) {
  return (
    <div className="flex items-center justify-center">
      <Button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
        {query.isFetchingNextPage ? 'Loading…' : label}
      </Button>
    </div>
  )
}
