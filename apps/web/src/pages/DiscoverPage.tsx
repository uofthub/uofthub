import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { ProjectGrid } from '../components/ProjectCard'
import { Btn, Card, Chip, EmptyState, ErrorText, Icon, PageHeader, Spinner, TextField } from '../components/ui'

const EXAMPLES = [
  'machine learning projects from Engineering',
  'trending bioinformatics research',
  'CSC309 web apps from this year',
  'design work by Architecture students',
]

/** Natural-language project search, backed by the /discover endpoint. */
export default function DiscoverPage() {
  usePageCrumbs([{ text: 'Discover', href: '/discover' }])
  const { user, loading } = useAuth()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['discover', submitted],
    queryFn: () => api.discover.search(submitted),
    enabled: !!submitted && !!user,
  })

  const run = (q: string) => {
    setQuery(q)
    setSubmitted(q)
  }

  // Discovery runs a language model per search, so the API requires a session.
  if (!loading && !user) {
    return (
      <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 980 }}>
        <PageHeader title="Discover" subtitle="Search for projects by describing what you want." />
        <EmptyState
          icon="mdi-creation"
          title="Sign in with your U of T account to use AI discovery."
          action={
            <Btn variant="accent" to="/session" style={{ marginTop: 16 }}>
              Sign in
            </Btn>
          }
        />
      </div>
    )
  }

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 980 }}>
      <PageHeader
        title="Discover"
        subtitle="Describe what you are looking for and we will translate it into a search."
        actions={
          <Chip small color="mint" style={{ fontWeight: 700 }}>
            BETA
          </Chip>
        }
      />

      <Card style={{ padding: 24 }}>
        <form
          onSubmit={e => {
            e.preventDefault()
            if (query.trim()) setSubmitted(query.trim())
          }}
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 320px' }}>
            <TextField
              prependIcon="mdi-creation"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="What are you looking for?"
              aria-label="Describe what you are looking for"
            />
          </div>
          <Btn variant="accent" type="submit" disabled={!query.trim() || isFetching} style={{ height: 44 }}>
            {isFetching ? 'Searching…' : 'Search'}
          </Btn>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {EXAMPLES.map(ex => (
            <Chip key={ex} small color="grey" onClick={() => run(ex)}>
              {ex}
            </Chip>
          ))}
        </div>

        {isError && <ErrorText>{(error as Error).message}</ErrorText>}
      </Card>

      {isFetching && <Spinner label="Interpreting your query…" />}

      {data && !isFetching && (
        <div style={{ marginTop: 32 }}>
          {Object.keys(data.params ?? {}).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
                <Icon name="mdi-filter-variant" size={16} /> Interpreted as
              </span>
              {Object.entries(data.params).map(([k, v]) => (
                <Chip key={k} small color="purple">
                  {k}: {String(v)}
                </Chip>
              ))}
            </div>
          )}

          {data.projects.length === 0 ? (
            <EmptyState icon="mdi-magnify-close" title="Nothing matched that query." />
          ) : (
            <ProjectGrid projects={data.projects} />
          )}
        </div>
      )}
    </div>
  )
}
