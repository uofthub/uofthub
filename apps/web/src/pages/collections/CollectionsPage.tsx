import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { CollectionCard, CollectionDialog, CollectionGrid } from '../../components/collection'
import {
  Button,
  EmptyState,
  LoadMore,
  Page,
  PageLede,
  PageTitle,
  Spinner,
  UnderlineTabs,
} from '../../components/ui'

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
    <Page width="wide" className="flex flex-col gap-7">
      {making && <CollectionDialog onClose={() => setMaking(false)} />}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <PageTitle>Collections</PageTitle>
          <PageLede>Hand-picked sets of projects, put together by students.</PageLede>
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

      <div key={tab} className="motion-safe:animate-tab-in">
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
          <CollectionGrid>
            {collections.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </CollectionGrid>
        )}
      </div>
      {pages.hasNextPage && <LoadMore query={pages} />}
    </Page>
  )
}
