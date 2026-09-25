import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { CollectionCard, CollectionDialog } from '../../components/collection'
import { Button, EmptyState, Spinner, UnderlineTabs } from '../../components/ui'

const PAGE = 12

type Tab = 'all' | 'mine'

/** Every collection, newest change first — and your own, on their own tab. */
export default function CollectionsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [making, setMaking] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  useDocumentTitle('Collections')

  const mine = tab === 'mine' && !!user
  const pages = useInfiniteQuery({
    queryKey: ['collections', 'list', mine ? user!.id : 'all'],
    queryFn: ({ pageParam }) =>
      api.collections.list({ owner: mine ? user!.id : undefined, take: PAGE, skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length * PAGE),
  })
  const collections = pages.data?.pages.flat() ?? []

  return (
    <div className="page page--wide stack" style={{ gap: 28 }}>
      {making && <CollectionDialog onClose={() => setMaking(false)} />}
      <div className="row wrap" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="page-title">Collections</h1>
          <p className="page-lede">Hand-picked sets of projects, put together by students.</p>
        </div>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => (user ? setMaking(true) : navigate('/session'))}
        >
          New collection
        </Button>
      </div>

      {user && (
        <UnderlineTabs<Tab>
          label="Which collections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'All' },
            { value: 'mine', label: 'Yours' },
          ]}
        />
      )}

      {pages.isLoading ? (
        <Spinner />
      ) : collections.length === 0 ? (
        <EmptyState
          icon="layers"
          title={mine ? 'You haven’t made a collection yet' : 'No collections yet'}
          action={
            <Button
              variant="primary"
              icon="plus"
              onClick={() => (user ? setMaking(true) : navigate('/session'))}
            >
              Make the first one
            </Button>
          }
        >
          Group the projects you’d show a friend — add any project from its More menu.
        </EmptyState>
      ) : (
        <div className="collection-grid">
          {collections.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      )}
      {pages.hasNextPage && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button onClick={() => pages.fetchNextPage()} disabled={pages.isFetchingNextPage}>
            {pages.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </Button>
        </div>
      )}
    </div>
  )
}
