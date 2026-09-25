import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type DiscoverFilters } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { useDocumentTitle } from '../../lib/hooks'
import { ProjectCollection } from '../../components/project'
import { Button, Chip, EmptyState, ErrorText, Icon, Input, Spinner } from '../../components/ui'
import '../explore/explore.css'

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
    <div className="row wrap" style={{ gap: 6 }}>
      <span className="muted row" style={{ gap: 6, fontSize: 14 }}>
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
    <div className="page page--wide stack" style={{ gap: 28 }}>
      <div>
        <h1 className="page-title">
          Ask discovery{' '}
          <Chip size="sm" tone="green" style={{ verticalAlign: 'middle' }}>
            Beta
          </Chip>
        </h1>
        <p className="page-lede">Describe what you’re looking for and it’s turned into a search.</p>
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
            className="stack"
            style={{ gap: 14 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (query.trim()) setAsked(query.trim())
            }}
          >
            <div className="row" style={{ gap: 10 }}>
              <label className="big-search grow">
                <Icon name="sparkle" size={22} />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={300}
                  placeholder="What are you looking for?"
                  aria-label="Describe what you are looking for"
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                disabled={!query.trim() || isFetching}
                style={{ height: 60 }}
              >
                {isFetching ? 'Searching…' : 'Search'}
              </Button>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
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
            <section className="stack" style={{ gap: 16 }}>
              <Understood filters={data.filters} />
              {!data.interpreted && (
                <p className="muted row" style={{ gap: 6, fontSize: 14 }}>
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
    </div>
  )
}
