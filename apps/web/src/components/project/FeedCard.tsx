import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { FeedReason as Reason, ProjectSummary } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { PHONE, useMediaQuery } from '../../lib/hooks'
import { actionTarget, cardAction } from '../../lib/outputs'
import { courseOf, postedAt, timeShort, topicTags } from '../../lib/projectView'
import { Avatar, AvatarStack, Button, Chip, Icon, Menu, MenuItem } from '../ui'
import { Cover, CoverTag } from './Cover'
import { SaveButton, StatusPill, TypeBadge, VisibilityPill } from './bits'
import { ReactionBar } from './ReactionBar'
import { ReportDialog } from './ReportDialog'
import { FeedReason } from './FeedReason'
import { AddToCollectionDialog } from '../collection'

/**
 * The home feed's project article: who, when, a big cover, what it is, and
 * what you can do about it. On a phone the same card drops its tags and main
 * button and shrinks its reactions to counts — the Mobile feed board. `reason`,
 * when given, is the line above it saying why it is in this feed.
 */
export function FeedCard({ project, reason }: { project: ProjectSummary; reason?: Reason | null }) {
  const { user } = useAuth()
  const phone = useMediaQuery(PHONE)
  const [reporting, setReporting] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const href = `/projects/${project.id}`
  const owner = project.owner
  const partners = project.collaborators.map((c) => c.user)
  const course = courseOf(project)
  const tags = topicTags(project).slice(0, 4)
  const action = cardAction(project)
  // The phone card drops the campus to keep the line to one row.
  const meta = [owner?.faculty, !phone && campusShort(owner?.campus), timeShort(postedAt(project))]
    .filter(Boolean)
    .join(' · ')

  const copy = () => navigator.clipboard?.writeText(`${window.location.origin}${href}`)

  return (
    <article className="card feed-card">
      {reporting && <ReportDialog projectId={project.id} onClose={() => setReporting(false)} />}
      {collecting && (
        <AddToCollectionDialog projectId={project.id} onClose={() => setCollecting(false)} />
      )}

      {reason && <FeedReason reason={reason} />}
      <header className="feed-card__head">
        {owner &&
          (partners.length > 0 && !phone ? (
            <AvatarStack people={[owner, ...partners]} size={40} max={2} />
          ) : (
            <Link to={`/u/${owner.id}`} tabIndex={-1} aria-hidden="true">
              <Avatar person={owner} size={phone ? 36 : 40} />
            </Link>
          ))}
        <div className="stack grow" style={{ gap: 2 }}>
          {owner && (
            <div className="feed-card__name">
              <Link to={`/u/${owner.id}`}>{owner.name}</Link>
              {partners.length > 0 && (
                <>
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {' '}
                    and{' '}
                  </span>
                  {partners.length === 1 ? (
                    <Link to={`/u/${partners[0].id}`}>{partners[0].name}</Link>
                  ) : (
                    `${partners.length} others`
                  )}
                </>
              )}
            </div>
          )}
          <div className="muted feed-card__meta">{meta}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <VisibilityPill visibility={project.visibility} />
          {!phone && <StatusPill status={project.status} />}
          <Menu
            width={200}
            trigger={({ toggle }) => (
              <button
                type="button"
                className="rx rx--bare"
                aria-label="More options"
                onClick={toggle}
              >
                <Icon name="more" size={18} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon="external" to={href} close={close}>
                  Open project
                </MenuItem>
                <MenuItem icon="link" onSelect={copy} close={close}>
                  Copy link
                </MenuItem>
                {user && ['PUBLIC', 'UOFT'].includes(project.visibility) && (
                  <MenuItem icon="layers" onSelect={() => setCollecting(true)} close={close}>
                    Add to collection
                  </MenuItem>
                )}
                {user && user.id !== project.ownerId && project.visibility !== 'PRIVATE' && (
                  <MenuItem icon="flag" onSelect={() => setReporting(true)} close={close}>
                    Report
                  </MenuItem>
                )}
              </>
            )}
          </Menu>
        </div>
      </header>

      <Link to={href} className="feed-card__cover" tabIndex={-1} aria-hidden="true">
        <Cover project={project} height={phone ? 206 : 330}>
          {action && (
            <CoverTag
              icon={<Icon name={action.icon === 'external' ? 'globe' : action.icon} size={14} />}
            >
              {action.icon === 'external' ? 'Live demo' : action.label}
            </CoverTag>
          )}
        </Cover>
      </Link>

      <div className="feed-card__body">
        {(project.type || course || project.orgProjects.length > 0) && (
          <div className="row wrap" style={{ gap: 8 }}>
            <TypeBadge type={project.type} />
            {course && (
              <Chip size={phone ? 'xs' : 'sm'} tone="subtle">
                Made for {course}
              </Chip>
            )}
            {project.orgProjects.map(({ org }) => (
              <Chip
                key={org.slug}
                size={phone ? 'xs' : 'sm'}
                tone="subtle"
                icon={org.type === 'LAB' ? 'flask' : 'users'}
                to={`/orgs/${org.slug}`}
              >
                Built with {org.name}
              </Chip>
            ))}
          </div>
        )}
        <h3 className="disp feed-card__title">
          <Link to={href}>{project.title}</Link>
        </h3>
        {project.pitch && <p className="feed-card__pitch">{project.pitch}</p>}
        {tags.length > 0 && !phone && (
          <div className="feed-card__tags">
            {tags.map((t) => (
              <Chip
                key={t}
                size="sm"
                to={`/explore?q=${encodeURIComponent(t)}`}
                style={{ height: 26 }}
              >
                #{t}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <footer className="feed-card__foot">
        <ReactionBar project={project} compact={phone} />
        {phone ? (
          <span className="push">
            <SaveButton project={project} />
          </span>
        ) : (
          <span className="feed-card__cta row" style={{ gap: 8 }}>
            <SaveButton project={project} />
            {action ? (
              <Button variant="primary" size="md" {...actionTarget(action)}>
                {action.label}
              </Button>
            ) : (
              <Button variant="primary" size="md" icon="chevronRight" to={href}>
                Open project
              </Button>
            )}
          </span>
        )}
      </footer>
    </article>
  )
}
