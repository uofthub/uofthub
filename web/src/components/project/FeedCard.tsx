import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { FeedReason as Reason, ProjectSummary } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { PHONE, useMediaQuery } from '../../lib/hooks'
import { actionTarget, cardAction } from '../../lib/outputs'
import { courseOf, postedAt, timeShort, topicTags } from '../../lib/projectView'
import {
  Avatar,
  AvatarStack,
  Button,
  Card,
  Chip,
  cx,
  Icon,
  Menu,
  MenuItem,
  PillButton,
} from '../ui'
import { Cover, CoverTag } from './Cover'
import { HelpNeeded, SaveButton, StatusPill, TypeBadge, VisibilityPill } from './bits'
import { titleLink } from './ProjectCard'
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
    <Card as="article" className="overflow-hidden">
      {reporting && (
        <ReportDialog
          target={{ kind: 'project', projectId: project.id }}
          onClose={() => setReporting(false)}
        />
      )}
      {collecting && (
        <AddToCollectionDialog projectId={project.id} onClose={() => setCollecting(false)} />
      )}

      {reason && <FeedReason reason={reason} />}
      <header
        className={cx(
          'flex items-center gap-2.5 px-3.5 pb-3 md:gap-3 md:px-5 md:pb-4',
          reason ? 'pt-2 md:pt-2.5' : 'pt-3 md:pt-4'
        )}
      >
        {owner &&
          (partners.length > 0 && !phone ? (
            <AvatarStack people={[owner, ...partners]} size={40} max={2} />
          ) : (
            <Link to={`/u/${owner.id}`} tabIndex={-1} aria-hidden="true">
              <Avatar person={owner} size={phone ? 36 : 40} />
            </Link>
          ))}
        <div className="flex min-w-0 grow flex-col gap-0.5">
          {owner && (
            <div className="min-w-0 text-14 font-semibold text-ink md:text-15">
              <Link to={`/u/${owner.id}`} className={titleLink}>
                {owner.name}
              </Link>
              {partners.length > 0 && (
                <>
                  <span className="font-normal text-muted"> and </span>
                  {partners.length === 1 ? (
                    <Link to={`/u/${partners[0].id}`} className={titleLink}>
                      {partners[0].name}
                    </Link>
                  ) : (
                    `${partners.length} others`
                  )}
                </>
              )}
            </div>
          )}
          <div className="text-12 text-muted md:text-13">{meta}</div>
        </div>
        <div className="flex items-center gap-2">
          <VisibilityPill visibility={project.visibility} />
          {!phone && <StatusPill status={project.status} />}
          <Menu
            width={200}
            trigger={({ toggle }) => (
              <PillButton bare aria-label="More options" onClick={toggle}>
                <Icon name="more" size={18} />
              </PillButton>
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

      <Link to={href} className="block" tabIndex={-1} aria-hidden="true">
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

      <div className="flex flex-col gap-2 px-3.5 pt-3.5 md:gap-2.5 md:px-5 md:pt-4.5 md:pb-1.5">
        {(project.type || course || project.orgProjects.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
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
        <h3 className="font-display text-22 leading-[1.15] font-bold tracking-tight md:text-26">
          <Link to={href} className={titleLink}>
            {project.title}
          </Link>
        </h3>
        {project.pitch && (
          <p className="text-14 leading-[1.45] text-ink-3 md:text-15 md:leading-normal">
            {project.pitch}
          </p>
        )}
        <HelpNeeded project={project} clamp="line-clamp-3" />
        {tags.length > 0 && !phone && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Chip key={t} size="sm" to={`/explore?q=${encodeURIComponent(t)}`} className="h-6.5">
                #{t}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-1.5 p-3.5 md:flex-wrap md:gap-3 md:px-5 md:pt-3.5 md:pb-4.5 xl:flex-nowrap">
        <ReactionBar project={project} compact={phone} />
        {phone ? (
          <span className="ml-auto">
            <SaveButton project={project} />
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-2">
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
    </Card>
  )
}
