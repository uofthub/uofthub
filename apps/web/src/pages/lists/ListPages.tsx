import { useInfiniteQuery } from '@tanstack/react-query'
import { api, type ProjectSummary } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDocumentTitle } from '../../lib/hooks'
import { useProjectPages } from '../../lib/queries'
import { ProjectCollection } from '../../components/project'
import { Button, EmptyState, Spinner, type IconName } from '../../components/ui'

/** The saved list is paged the way the API pages profile lists. */
const SAVED_PAGE = 24

function ListPage({
  title,
  lede,
  icon,
  empty,
  query,
}: {
  title: string
  lede: string
  icon: IconName
  empty: { title: string; body?: string }
  query: {
    projects: ProjectSummary[]
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => unknown
  }
}) {
  useDocumentTitle(title)
  return (
    <div className="page page--wide stack" style={{ gap: 28 }}>
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-lede">{lede}</p>
      </div>
      {query.isLoading ? (
        <Spinner />
      ) : query.projects.length === 0 ? (
        <EmptyState
          icon={icon}
          title={empty.title}
          action={
            <Button variant="primary" to="/explore">
              Explore projects
            </Button>
          }
        >
          {empty.body}
        </EmptyState>
      ) : (
        <ProjectCollection projects={query.projects} layout="card" />
      )}
      {query.hasNextPage && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Your bookmarks — private to you, newest save first. */
export function SavedPage() {
  const { user, loading } = useAuth()
  const saved = useInfiniteQuery({
    queryKey: ['saved'],
    queryFn: ({ pageParam }) => api.users.saved({ skip: pageParam }),
    enabled: !!user,
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last.length < SAVED_PAGE ? undefined : all.length * SAVED_PAGE,
  })

  if (!loading && !user) {
    return (
      <div className="page">
        <EmptyState
          icon="bookmark"
          title="Sign in to see what you’ve saved"
          action={
            <Button variant="primary" to="/session">
              Sign in
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <ListPage
      title="Saved"
      lede="Projects you bookmarked. Only you can see this list."
      icon="bookmark"
      empty={{
        title: 'Nothing saved yet',
        body: 'Tap the bookmark on any project to keep it here.',
      }}
      query={{
        ...saved,
        isLoading: saved.isLoading || loading,
        projects: saved.data?.pages.flat() ?? [],
      }}
    />
  )
}

/** Projects that said they need a hand — status "Looking for help". */
export function HelpWantedPage() {
  const help = useProjectPages({ status: 'HELP_WANTED', sort: 'new' })
  return (
    <ListPage
      title="Looking for help"
      lede="Projects asking for a developer, designer, co-author or tester. Offer with “Want to collab”."
      icon="megaphone"
      empty={{
        title: 'Nobody is asking for help right now',
        body: 'Mark one of your own projects as looking for help and it shows up here.',
      }}
      query={help}
    />
  )
}
