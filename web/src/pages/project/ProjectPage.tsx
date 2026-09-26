import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { facultyByName } from '../../lib/faculties'
import { useDocumentTitle } from '../../lib/hooks'
import { courseOf } from '../../lib/projectView'
import { CONTACT_EMAIL } from '../../lib/site'
import { Button, cx, EmptyState, Icon, Notice, Page, Spinner } from '../../components/ui'
import { Gallery } from './Gallery'
import { InfoCard } from './InfoCard'
import { UpdateDialog } from './OwnerDialogs'
import { Contents, Overview, ProjectSections, References } from './Content'
import { Comments, Related, Updates } from './Sections'

/** The page's two columns: the story, and a 440px column of facts beside it. */
const grid = 'grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px] xl:gap-8'

/** The Project page board. */
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { hash } = useLocation()
  const { user } = useAuth()
  const [updating, setUpdating] = useState(false)

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.projects.get(id!),
    enabled: !!id,
  })
  const { data: versions = [] } = useQuery({
    queryKey: ['versions', id],
    queryFn: () => api.projects.versions(id!),
    enabled: !!project,
  })
  useDocumentTitle(project?.title)

  // A link to #comments has to wait for the page to exist before it can land.
  useEffect(() => {
    if (project && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [project, hash])

  if (isLoading) return <Spinner />
  if (!project) {
    return (
      <Page>
        <EmptyState
          icon="eyeOff"
          title="This project isn’t here"
          action={
            <Button variant="primary" to="/explore">
              Explore projects
            </Button>
          }
        >
          It may have been deleted, or it is private to the people who made it.
        </EmptyState>
      </Page>
    )
  }

  const isOwner = user?.id === project.ownerId
  const course = courseOf(project)
  const faculty = project.owner?.faculty

  return (
    <Page className="pt-5 md:pt-5 lg:pt-5">
      {updating && <UpdateDialog project={project} onClose={() => setUpdating(false)} />}

      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex flex-wrap items-center gap-2 text-14 text-muted"
      >
        <Link to="/explore">Explore</Link>
        {faculty && (
          <>
            <Icon name="chevronRight" size={14} />
            <Link to={`/explore?faculty=${encodeURIComponent(faculty)}`}>
              {facultyByName(faculty)?.short ?? faculty}
            </Link>
          </>
        )}
        {course && (
          <>
            <Icon name="chevronRight" size={14} />
            <Link to={`/explore?course=${encodeURIComponent(course)}`}>{course}</Link>
          </>
        )}
        <Icon name="chevronRight" size={14} />
        <span className="font-semibold text-ink">{project.title}</span>
      </nav>

      {/* Only the owner and accepted collaborators can still load a taken-down
          project — it is forced back to private — so this is for them. */}
      {project.takenDownAt && (
        <Notice tone="danger" icon="alert" title="Taken down by a moderator" className="mb-5">
          This project was reported and reviewed on{' '}
          {new Date(project.takenDownAt).toLocaleDateString()}. It is private to you now and its
          visibility cannot be changed. Nothing has been deleted. Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to appeal.
        </Notice>
      )}

      <div className={grid}>
        <Gallery project={project} isOwner={isOwner} />
        <InfoCard project={project} latest={versions[0]} />
      </div>

      <div className={cx(grid, 'pt-5 xl:pt-8')}>
        <div className="flex min-w-0 flex-col gap-6">
          <Overview project={project} />
          <ProjectSections project={project} />
          <References project={project} />
          <Updates
            project={project}
            versions={versions}
            isOwner={isOwner}
            onPost={() => setUpdating(true)}
          />
          <Comments project={project} />
        </div>
        <aside className="flex flex-col gap-5">
          <Contents project={project} />
          <Related project={project} />
        </aside>
      </div>
    </Page>
  )
}
