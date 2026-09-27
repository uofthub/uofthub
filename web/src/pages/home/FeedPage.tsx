import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { Campus, ProjectType } from '@uofthub/types'
import { api, type FeedItem } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { PHONE, useDocumentTitle, useMediaQuery } from '../../lib/hooks'
import { PAGE_SIZE } from '../../lib/queries'
import { reasonToShow } from '../../lib/feedReason'
import { PROJECT_TYPES } from '../../lib/projectMeta'
import { FeedCard, LayoutToggle, ProjectListRow, type CardLayout } from '../../components/project'
import {
  Button,
  Chip,
  cx,
  EmptyState,
  LoadMore,
  SegmentedTabs,
  Spinner,
  type TabOption,
  UnderlineTabs,
} from '../../components/ui'
import { Composer } from './Composer'
import { RightRail } from './RightRail'
import { LeftRail } from './LeftRail'
import { Spotlight } from './Spotlight'
import { profilePath } from '../../lib/paths'

type FeedTab = 'following' | 'campus' | 'program'

const TABS: TabOption<FeedTab>[] = [
  { value: 'following', label: 'Following' },
  { value: 'campus', label: 'Campus' },
  { value: 'program', label: 'Your program' },
]

/** Stored per browser — a preference, not something worth an API round trip. */
function remembered<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A browser that blocks storage just forgets between visits.
  }
}

/**
 * One tab of the feed, straight from the API's scoped feed: newest first,
 * narrowed server-side by campus and type so paging stays exact.
 */
function useScopedFeed(scope: FeedTab, campus: Campus | '', type: ProjectType | '') {
  const query = useInfiniteQuery({
    queryKey: ['feed', scope, campus, type],
    queryFn: ({ pageParam }) =>
      api.feed.list({
        skip: pageParam,
        scope,
        campus: campus || undefined,
        type: type || undefined,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last.items.length < PAGE_SIZE ? undefined : all.length * PAGE_SIZE,
  })
  const items = (query.data?.pages ?? []).flatMap((p) => p.items)
  return { ...query, items, projects: items.map((i) => i.project) }
}

function FeedList({
  items,
  scope,
  layout,
}: {
  items: FeedItem[]
  scope: FeedTab
  layout: CardLayout
}) {
  return (
    <div className={cx('flex flex-col', layout === 'card' ? 'gap-5' : 'gap-3.5')}>
      {items.map(({ project: p, reason }) =>
        layout === 'card' ? (
          <FeedCard key={p.id} project={p} reason={reasonToShow(reason, scope)} />
        ) : (
          <ProjectListRow key={p.id} project={p} />
        )
      )}
    </div>
  )
}

/** The signed-in home page at /feed — the Home feed and Mobile feed boards. */
export default function FeedPage() {
  const { user } = useAuth()
  const phone = useMediaQuery(PHONE)
  useDocumentTitle('Home')

  const [tab, setTab] = useState<FeedTab>(() =>
    remembered('feed-tab', 'campus', ['following', 'campus', 'program'])
  )
  const [layout, setLayout] = useState<CardLayout>(() =>
    remembered('feed-layout', 'card', ['card', 'list'])
  )
  const [campus, setCampus] = useState<Campus | ''>('')
  const [type, setType] = useState<ProjectType | ''>('')

  const chooseTab = (t: FeedTab) => {
    setTab(t)
    remember('feed-tab', t)
  }
  const chooseLayout = (l: CardLayout) => {
    setLayout(l)
    remember('feed-layout', l)
  }

  const active = useScopedFeed(tab, campus, type)
  const projects = active.projects

  const empty = (() => {
    if (tab === 'program' && !user?.faculty) {
      return (
        <EmptyState
          icon="users"
          title="Add your faculty to see work from your program"
          action={
            <Button variant="primary" to={user ? profilePath(user) : '/session'}>
              Edit your profile
            </Button>
          }
        />
      )
    }
    if (tab === 'following') {
      return (
        <EmptyState
          icon="userPlus"
          title="Nothing from people you follow yet"
          action={
            <Button variant="primary" to="/explore">
              Find people on Explore
            </Button>
          }
        >
          Follow a few students and their new projects land here first.
        </EmptyState>
      )
    }
    return (
      <EmptyState
        icon="layers"
        title="No projects here yet"
        action={
          <Button variant="primary" icon="plus" to="/projects/new">
            Post the first one
          </Button>
        }
      />
    )
  })()

  const feed = (
    <>
      <div key={tab} className="motion-safe:animate-tab-in">
        {active.isLoading ? (
          <Spinner />
        ) : projects.length === 0 && !active.hasNextPage ? (
          empty
        ) : (
          <FeedList items={active.items} scope={tab} layout={phone ? 'card' : layout} />
        )}
      </div>
      {active.hasNextPage && <LoadMore query={active} />}
    </>
  )

  if (phone) {
    return (
      <div>
        <UnderlineTabs
          label="Feed"
          options={TABS}
          value={tab}
          onChange={chooseTab}
          className="gap-5.5 bg-surface px-4"
          itemClassName="text-15"
        />
        {/* The board filters the phone feed by type — which the API does not
            store yet, so only "All" does anything. */}
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-3">
          <Chip
            tone={type === '' ? 'active' : 'default'}
            pressed={type === ''}
            onClick={() => setType('')}
          >
            All
          </Chip>
          {(['APP', 'RESEARCH', 'FILM', 'DESIGN', 'AUDIO', 'HARDWARE'] as ProjectType[]).map(
            (t) => (
              <Chip
                key={t}
                tone={type === t ? 'active' : 'default'}
                pressed={type === t}
                onClick={() => setType(type === t ? '' : t)}
              >
                {PROJECT_TYPES[t].plural}
              </Chip>
            )
          )}
        </div>
        <div className="flex flex-col gap-3 px-3 pb-4">{feed}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-190 grid-cols-1 items-start gap-7 px-6 pt-6 pb-12 lg:max-w-[1440px] lg:grid-cols-[232px_minmax(0,1fr)] 2xl:grid-cols-[232px_minmax(0,1fr)_320px] 2xl:gap-9 2xl:px-10 2xl:pt-7">
      <LeftRail campus={campus} onCampus={setCampus} />
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs label="Feed" options={TABS} value={tab} onChange={chooseTab} />
          <LayoutToggle value={layout} onChange={chooseLayout} />
        </div>
        <Spotlight />
        <Composer />
        {feed}
      </div>
      <RightRail />
    </div>
  )
}
