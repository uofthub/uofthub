import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { facultyByName } from '../../lib/faculties'
import { useDocumentTitle } from '../../lib/hooks'
import { courseOf } from '../../lib/projectView'
import { CONTACT_EMAIL } from '../../lib/site'
import { Button, EmptyState, Icon, Spinner } from '../../components/ui'
import { Gallery } from './Gallery'
import { InfoCard } from './InfoCard'
import { UpdateDialog } from './OwnerDialogs'
import { Contents, Overview, ProjectSections, References } from './Content'
import { Comments, Related, Updates } from './Sections'
import './project-page.css'

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
      <div className="page">
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
      </div>
    )
  }

  const isOwner = user?.id === project.ownerId
  const course = courseOf(project.tags)
  const faculty = project.owner?.faculty

  return (
    <div className="page project-page">
      {updating && <UpdateDialog project={project} onClose={() => setUpdating(false)} />}

      <nav aria-label="Breadcrumb" className="crumbs muted">
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
        <span className="crumbs__here">{project.title}</span>
      </nav>

      {/* Only the owner and accepted collaborators can still load a taken-down
          project — it is forced back to private — so this is for them. */}
      {project.takenDownAt && (
        <div className="notice notice--danger">
          <Icon name="alert" size={20} />
          <div>
            <b>Taken down by a moderator</b>
            <p>
              This project was reported and reviewed on{' '}
              {new Date(project.takenDownAt).toLocaleDateString()}. It is private to you now and its
              visibility cannot be changed. Nothing has been deleted. Email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to appeal.
            </p>
          </div>
        </div>
      )}

      <div className="project-grid">
        <Gallery project={project} isOwner={isOwner} />
        <InfoCard project={project} latest={versions[0]} />
      </div>

      <div className="project-grid project-grid--lower">
        <div className="stack" style={{ gap: 24, minWidth: 0 }}>
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
        <aside className="stack" style={{ gap: 20 }}>
          <Contents project={project} />
          <Related project={project} />
        </aside>
      </div>
    </div>
  )
}
