import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type DiscoverFilters } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { useDocumentTitle } from '../../lib/hooks'
import { ProjectCollection } from '../../components/project'
import {
  Button,
  Chip,
  cx,
  EmptyState,
  ErrorText,
  Icon,
  Page,
  PageLede,
  PageTitle,
  searchFrame,
  searchInput,
  Spinner,
} from '../../components/ui'

const EXAMPLES = [
  'machine learning projects from Engineering',
  'trending bioinformatics research',
  'what have students built in CSC309 this year',
  'design work by Architecture students',
]

const WITHIN: Record<string, string> = { month: 'past month', term: 'past term', year: 'past year' }

/** What the question was read as, so an empty result can be explained. */
function Understood({ filters }: { filters: DiscoverFilters }) {
  const shown = [
    filters.search && `about ${filters.search}`,
    filters.tag && `tagged ${filters.tag}`,
    filters.faculty && `from ${filters.faculty}`,
    filters.campus && `at ${campusShort(filters.campus)}`,
    filters.sort && `sorted by ${filters.sort}`,
    filters.within && `from the ${WITHIN[filters.within]}`,
  ].filter(Boolean) as string[]
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1.5 text-14 text-muted">
        <Icon name="filter" size={16} /> Searched for
      </span>
      {shown.map((s) => (
        <Chip key={s} size="sm" tone="navy">
          {s}
        </Chip>
      ))}
    </div>
  )
}

/**
 * Plain-English search over `/discover`. Not on the boards — reached from the
 * account menu until the design gives it a place (see the handoff notes).
 */
export default function DiscoverPage() {
  const { user, loading } = useAuth()
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  useDocumentTitle('Ask AI discovery')

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['discover', asked],
    queryFn: () => api.discover.search(asked),
    enabled: !!asked && !!user,
    // Each run costs a model call.
    refetchOnWindowFocus: false,
  })

  const ask = (q: string) => {
    setQuery(q)
    setAsked(q)
  }

  return (
    <Page width="wide" className="flex flex-col gap-7">
      <div>
        <PageTitle>
          Ask discovery{' '}
          <Chip size="sm" tone="green" className="align-middle">
            Beta
          </Chip>
        </PageTitle>
        <PageLede>Describe what you’re looking for and it’s turned into a search.</PageLede>
      </div>

      {!loading && !user ? (
        <EmptyState
          icon="sparkle"
          title="Sign in with your U of T account to use AI discovery"
          action={
            <Button variant="primary" to="/session">
              Sign in
            </Button>
          }
        />
      ) : (
        <>
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (query.trim()) setAsked(query.trim())
            }}
          >
            <div className="flex items-center gap-2.5">
              <label
                className={cx(searchFrame, 'h-15 min-w-0 grow gap-3 rounded-2xl px-4 md:px-5')}
              >
                <Icon name="sparkle" size={22} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={300}
                  placeholder="What are you looking for?"
                  aria-label="Describe what you are looking for"
                  className={cx(searchInput, 'h-full text-18')}
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                disabled={!query.trim() || isFetching}
                className="h-15"
              >
                {isFetching ? 'Searching…' : 'Search'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {EXAMPLES.map((ex) => (
                <Chip key={ex} tone="outline" onClick={() => ask(ex)}>
                  {ex}
                </Chip>
              ))}
            </div>
          </form>
          {isError && <ErrorText>{(error as Error).message}</ErrorText>}
          {isFetching && <Spinner label="Reading your question…" />}
          {data && !isFetching && (
            <section className="flex flex-col gap-4">
              <Understood filters={data.filters} />
              {!data.interpreted && (
                <p className="flex items-center gap-1.5 text-14 text-muted">
                  <Icon name="info" size={15} /> Interpretation is unavailable right now, so this
                  ran as a keyword search.
                </p>
              )}
              {data.projects.length === 0 ? (
                <EmptyState icon="search" title="Nothing matched that" />
              ) : (
                <ProjectCollection projects={data.projects} layout="list" />
              )}
            </section>
          )}
        </>
      )}
    </Page>
  )
}
