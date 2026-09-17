import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { usePageCrumbs } from '../lib/crumbs'
import { ProjectGrid } from '../components/ProjectCard'
import { Chip, EmptyState, PageHeader, Spinner } from '../components/ui'

/** Every project carrying a given tag — course codes, tools, topics. */
export default function CoursePage() {
  const { tag } = useParams<{ tag: string }>()
  const label = tag ? decodeURIComponent(tag) : ''
  usePageCrumbs([{ text: 'Projects', href: '/projects' }, { text: label }])

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['courseProjects', tag],
    queryFn: () => api.projects.list({ search: label }),
    enabled: !!tag,
  })

  return (
    // Same reading column as the directory's list, for the same reason: this
    // is the directory filtered to one tag, and it would be odd for /projects
    // and /courses/CSC309 to disagree about how student work is shown.
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 920 }}>
      <PageHeader
        title={label}
        subtitle={`Projects tagged with ${label}.`}
        actions={
          <Chip color="blue" style={{ fontWeight: 700 }}>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </Chip>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState icon="mdi-tag-off-outline" title={`Nothing tagged “${label}” yet.`} />
      ) : (
        <ProjectGrid projects={projects} view="list" />
      )}
    </div>
  )
}
