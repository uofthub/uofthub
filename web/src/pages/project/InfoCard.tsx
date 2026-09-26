import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, safeUrl, type ProjectDetail, type ProjectVersion } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { previewKindFor } from '../../lib/files'
import { useFollow } from '../../lib/hooks'
import {
  codeLink,
  courseOf,
  LINK_ICONS,
  postedAt,
  primaryAction,
  safeLinks,
  timeAgo,
  topicTags,
} from '../../lib/projectView'
import {
  ReactionBar,
  ReportDialog,
  SaveButton,
  StatusPill,
  TypeBadge,
  VisibilityPill,
} from '../../components/project'
import {
  Avatar,
  Button,
  Card,
  Chip,
  cx,
  ErrorText,
  Eyebrow,
  Icon,
  LinkButton,
  Menu,
  MenuDivider,
  MenuItem,
  type AvatarPerson,
  type IconName,
} from '../../components/ui'
import {
  FilesDialog,
  InsightsDialog,
  LinksDialog,
  PeopleDialog,
  UpdateDialog,
  GroupsDialog,
} from './OwnerDialogs'
import { AddToCollectionDialog } from '../../components/collection'
import FileViewer from '../../components/FileViewer'
import {
  OUTPUT_KINDS,
  outputLabel,
  primaryOutput,
  resolveOutputs,
  type ResolvedOutput,
} from '../../lib/outputs'

type Open =
  'update' | 'links' | 'files' | 'people' | 'groups' | 'insights' | 'report' | 'collect' | null

function Maker({
  person,
  line,
  sub,
}: {
  person: AvatarPerson & { id: string }
  line?: string
  sub?: string
}) {
  const follow = useFollow(person.id)
  return (
    <div className="flex items-center gap-3">
      <Link to={`/u/${person.id}`} tabIndex={-1} aria-hidden="true">
        <Avatar person={person} size={44} />
      </Link>
      <div className="min-w-0 grow">
        <Link to={`/u/${person.id}`} className="block text-15 font-semibold text-ink">
          {person.name}
        </Link>
        {line && <div className="text-14 text-ink-3">{line}</div>}
        {sub && <div className="text-13 text-muted">{sub}</div>}
      </div>
      {follow.canFollow && (
        <Button
          size="sm"
          onClick={follow.toggle}
          disabled={follow.pending}
          className="px-3 text-13"
        >
          {follow.following ? 'Following' : 'Follow'}
        </Button>
      )}
    </div>
  )
}

/** One row of the facts list: a grey label, and what it says. */
function Fact({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={cx('min-w-0', className)}>{children}</dd>
    </>
  )
}

/** A link in the facts list, its icon ahead of it. */
const factLink = 'flex items-center gap-1'

type OutputTarget = { href?: string; onClick?: () => void }

/**
 * How an output opens: a link in a new tab, a file the browser can show in
 * the in-app viewer, anything else as a download.
 */
function outputTarget(
  projectId: string,
  o: ResolvedOutput,
  view: (fileId: string) => void
): OutputTarget {
  if (o.link) return { href: safeUrl(o.link.url) }
  if (o.file && previewKindFor(o.file.name)) return { onClick: () => view(o.file!.id) }
  return o.file ? { href: api.projects.downloadUrl(projectId, o.file.id) } : {}
}

/**
 * The card beside the gallery: what it is, what you can do with it, who made
 * it, and the facts. Everything the owner can change lives behind the More
 * button, so the card reads the same to its owner as to anyone else.
 */
export function InfoCard({ project, latest }: { project: ProjectDetail; latest?: ProjectVersion }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  // ?people=1 — an access-request notification opens the People dialog.
  const [open, setOpen] = useState<Open>(() =>
    new URLSearchParams(window.location.search).get('people') && user?.id === project.ownerId
      ? 'people'
      : null
  )
  // The only way pinning fails is the six-project cap, and that has to be
  // said out loud — a button that quietly does nothing reads as a bug.
  const [pinError, setPinError] = useState<string | null>(null)

  const isOwner = user?.id === project.ownerId
  const outputs = resolveOutputs(project)
  const primary = primaryOutput(outputs)
  const previewable = project.files.filter((f) => previewKindFor(f.name))
  // A card's "View poster" arrives as ?view=<fileId>, opening it here.
  const [params, setParams] = useSearchParams()
  const asked = params.get('view')
  const [viewing, setViewing] = useState<string | null>(() =>
    asked && previewable.some((f) => f.id === asked) ? asked : null
  )
  const closeViewer = () => {
    setViewing(null)
    if (asked) {
      params.delete('view')
      setParams(params, { replace: true })
    }
  }
  // An output's file or link is listed with the outputs, not again below.
  const outputFiles = new Set(outputs.flatMap((o) => (o.file ? [o.file.id] : [])))
  const outputLinks = new Set(outputs.flatMap((o) => (o.link ? [o.link.id] : [])))
  const links = safeLinks(project.links.filter((l) => !outputLinks.has(l.id)))
  const target = (o: ResolvedOutput) => outputTarget(project.id, o, setViewing)
  // The primary output decides the main button when there is one; otherwise
  // it is read off the links, as before outputs existed.
  const action: (OutputTarget & { label: string; icon: IconName }) | undefined = primary
    ? {
        label: OUTPUT_KINDS[primary.kind].action,
        icon: OUTPUT_KINDS[primary.kind].icon,
        ...target(primary),
      }
    : primaryAction(safeLinks(project.links))
  // "View code" beside it, unless the main button already is that.
  const code = primary?.kind === 'CODE' ? undefined : codeLink(safeLinks(project.links))
  const course = courseOf(project)
  const pitch = project.pitch
  const tags = topicTags(project)
  const documents = project.files.filter((f) => {
    const kind = previewKindFor(f.name)
    return kind !== 'image' && kind !== 'video' && !outputFiles.has(f.id)
  })

  const posted = postedAt(project)
  const edited = new Date(project.updatedAt).getTime() - new Date(posted).getTime() > 60 * 60 * 1000

  const refresh = () => qc.invalidateQueries({ queryKey: ['project', project.id] })
  const pin = useMutation({
    mutationFn: () => api.projects.pin(project.id),
    onSuccess: () => {
      setPinError(null)
      refresh()
      qc.invalidateQueries({ queryKey: ['pinnedProjects'] })
    },
    onError: (err: Error) => setPinError(err.message),
  })
  const remove = useMutation({
    mutationFn: () => api.projects.delete(project.id),
    onSuccess: () => navigate(`/u/${project.ownerId}`),
  })
  const fork = useMutation({
    mutationFn: () => api.projects.fork(project.id),
    onSuccess: (f) => navigate(`/projects/${f.id}`),
  })
  // A credited collaborator can step off the project themself.
  const isCollaborator = !!user && project.collaborators.some((c) => c.user.id === user.id)
  const leave = useMutation({
    mutationFn: () => api.projects.removeCollaborator(project.id, user!.id),
    onSuccess: () => refresh(),
  })
  const actionError = [remove, fork, leave].find((m) => m.isError)?.error

  return (
    <Card as="section" className="flex flex-col gap-4.5 px-4.5 py-5 md:p-6.5">
      {viewing && (
        <FileViewer
          projectId={project.id}
          files={previewable}
          fileId={viewing}
          onSelect={setViewing}
          onClose={closeViewer}
        />
      )}
      {open === 'update' && <UpdateDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'groups' && <GroupsDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'links' && <LinksDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'files' && <FilesDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'people' && <PeopleDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'insights' && (
        <InsightsDialog projectId={project.id} onClose={() => setOpen(null)} />
      )}
      {open === 'report' && (
        <ReportDialog
          target={{ kind: 'project', projectId: project.id }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'collect' && (
        <AddToCollectionDialog projectId={project.id} onClose={() => setOpen(null)} />
      )}

      <div className="flex min-h-5.5 items-center gap-2">
        <TypeBadge type={project.type} />
        <StatusPill status={project.status} />
        <VisibilityPill visibility={project.visibility} />
        {!!project.pinnedAt && isOwner && (
          <Chip size="sm" tone="navy" icon="pin">
            Pinned
          </Chip>
        )}
        {latest && <span className="ml-auto text-13 text-muted">v{latest.versionNum}</span>}
      </div>

      <div>
        <h1 className="font-display text-32 leading-[1.05] font-bold tracking-tightest wrap-anywhere md:text-44">
          {project.title}
        </h1>
        {pitch && <p className="mt-2.5 text-17 leading-normal text-ink-3">{pitch}</p>}
        {project.forkedFromId && (
          <p className="mt-2 flex items-center gap-1.5 text-13 text-muted">
            <Icon name="fork" size={14} /> Forked from{' '}
            <Link to={`/projects/${project.forkedFromId}`}>another project</Link>
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {action ? (
          action.href ? (
            <Button variant="primary" icon={action.icon} href={action.href} className="grow">
              {action.label}
            </Button>
          ) : (
            <Button variant="primary" icon={action.icon} onClick={action.onClick} className="grow">
              {action.label}
            </Button>
          )
        ) : code ? (
          <Button variant="primary" icon="code" href={code.href} className="grow">
            View code
          </Button>
        ) : project.canEdit ? (
          // Not "add a live link": most projects have nothing to run. What
          // every project can lead with is what it produced.
          <Button
            variant="primary"
            icon="plus"
            to={`/projects/${project.id}/edit`}
            className="grow"
          >
            Add what it produced
          </Button>
        ) : null}
        {action && code && (
          <Button icon="code" href={code.href}>
            View code
          </Button>
        )}
        <SaveButton project={project} size="lg" />
        <Menu
          width={250}
          trigger={({ toggle, open: menuOpen }) => (
            <Button
              iconOnly
              icon="more"
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={toggle}
            />
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon="link"
                onSelect={() => navigator.clipboard?.writeText(window.location.href)}
                close={close}
              >
                Copy link
              </MenuItem>
              {/* Only listed work can be collected — see routes/collections.ts. */}
              {user && ['PUBLIC', 'UOFT'].includes(project.visibility) && !project.takenDownAt && (
                <MenuItem icon="layers" onSelect={() => setOpen('collect')} close={close}>
                  Add to collection
                </MenuItem>
              )}
              {project.canEdit && (
                <>
                  <MenuDivider />
                  <MenuItem
                    icon="pen"
                    onSelect={() => navigate(`/projects/${project.id}/edit`)}
                    close={close}
                  >
                    Edit project
                  </MenuItem>
                  <MenuItem icon="link" onSelect={() => setOpen('links')} close={close}>
                    Manage links
                  </MenuItem>
                  <MenuItem icon="upload" onSelect={() => setOpen('files')} close={close}>
                    Manage files
                  </MenuItem>
                  <MenuItem icon="send" onSelect={() => setOpen('update')} close={close}>
                    Post an update
                  </MenuItem>
                </>
              )}
              {isOwner && (
                <>
                  <MenuItem icon="users" onSelect={() => setOpen('people')} close={close}>
                    People
                  </MenuItem>
                  <MenuItem icon="users" onSelect={() => setOpen('groups')} close={close}>
                    Link to a group
                  </MenuItem>
                  <MenuItem icon="pin" onSelect={() => pin.mutate()} close={close}>
                    {project.pinnedAt ? 'Unpin from profile' : 'Pin to profile'}
                  </MenuItem>
                  <MenuItem icon="chart" onSelect={() => setOpen('insights')} close={close}>
                    Insights
                  </MenuItem>
                  <MenuDivider />
                  <MenuItem
                    icon="trash"
                    danger
                    onSelect={() =>
                      confirm('Delete this project? This cannot be undone.') && remove.mutate()
                    }
                    close={close}
                  >
                    Delete project
                  </MenuItem>
                </>
              )}
              {isCollaborator && (
                <MenuItem
                  icon="logout"
                  onSelect={() =>
                    confirm('Leave this project? You’ll no longer be credited on it.') &&
                    leave.mutate()
                  }
                  close={close}
                >
                  Leave project
                </MenuItem>
              )}
              {user && !isOwner && (
                <>
                  <MenuItem icon="fork" onSelect={() => fork.mutate()} close={close}>
                    Fork a copy
                  </MenuItem>
                  {/* A private project has no audience beyond its makers. */}
                  {project.visibility !== 'PRIVATE' && (
                    <MenuItem icon="flag" onSelect={() => setOpen('report')} close={close}>
                      Report
                    </MenuItem>
                  )}
                </>
              )}
            </>
          )}
        </Menu>
      </div>
      {pinError && <ErrorText>{pinError}</ErrorText>}
      {actionError && <ErrorText>{actionError.message}</ErrorText>}

      <ReactionBar project={project} />

      <hr />

      <div className="flex flex-col gap-3.5">
        <Eyebrow as="span">Made by</Eyebrow>
        {project.owner && (
          <Maker
            person={project.owner}
            line={project.collaborators.length > 0 ? 'Owner' : undefined}
            sub={[project.owner.faculty, campusShort(project.owner.campus)]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        {project.collaborators.map((c) => (
          <Maker key={c.user.id} person={c.user} line={c.title || 'Collaborator'} />
        ))}
        {isOwner && (
          <LinkButton onClick={() => setOpen('people')}>+ Invite a collaborator</LinkButton>
        )}
      </div>

      <hr />

      <dl className="grid grid-cols-[110px_1fr] gap-y-2.5 text-14">
        {course && (
          <Fact label="Course">
            <Link to={`/explore?course=${encodeURIComponent(course)}`} className="font-semibold">
              Made for {course}
            </Link>
          </Fact>
        )}
        {/* The author's own facts — Supervisor, Runtime, Performers — in
            their order. The API drops a row missing either side. */}
        {(project.details ?? []).map((d, i) => (
          <Fact key={`${d.label}-${i}`} label={d.label} className="wrap-anywhere">
            {d.value}
          </Fact>
        ))}
        {project.owner?.campus && <Fact label="Campus">{campusShort(project.owner.campus)}</Fact>}
        {project.orgProjects.length > 0 && (
          <Fact label="Built with" className="flex flex-wrap items-center gap-3">
            {project.orgProjects.map(({ org }) => (
              <Link
                key={org.slug}
                to={`/orgs/${org.slug}`}
                className={cx(factLink, 'font-semibold')}
              >
                <Icon name={org.type === 'LAB' ? 'flask' : 'users'} size={14} />
                {org.name}
              </Link>
            ))}
          </Fact>
        )}
        <Fact label="Posted">
          {timeAgo(posted)}
          {edited && ` · updated ${timeAgo(project.updatedAt)}`}
        </Fact>
        {outputs.length > 0 && (
          <Fact label="Outputs" className="flex flex-col gap-1.5">
            {outputs.map((o) => {
              const { href, onClick } = target(o)
              const body = (
                <>
                  <Icon name={OUTPUT_KINDS[o.kind].icon} size={14} />
                  <span className="line-clamp-1">{outputLabel(o)}</span>
                  {o.primary && <span className="text-muted">· main</span>}
                </>
              )
              return href ? (
                <a
                  key={o.id}
                  href={href}
                  className={factLink}
                  {...(o.link && { target: '_blank', rel: 'noopener noreferrer' })}
                >
                  {body}
                </a>
              ) : (
                <LinkButton key={o.id} className="flex" onClick={onClick}>
                  {body}
                </LinkButton>
              )
            })}
          </Fact>
        )}
        {links.length > 0 && (
          <Fact label="Links" className="flex flex-wrap items-center gap-3">
            {links.map((l) => (
              <a
                key={l.id}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className={factLink}
              >
                <Icon name={LINK_ICONS[l.role]} size={14} />
                {l.label || 'Link'}
              </a>
            ))}
          </Fact>
        )}
        {documents.length > 0 && (
          <Fact label="Files" className="flex flex-col gap-1">
            {documents.map((f) => (
              <a key={f.id} href={api.projects.downloadUrl(project.id, f.id)} className={factLink}>
                <Icon name="download" size={14} />
                <span className="line-clamp-1">{f.name}</span>
              </a>
            ))}
          </Fact>
        )}
      </dl>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <Chip key={t} size="sm" to={`/explore?q=${encodeURIComponent(t)}`} className="h-6.5">
              #{t}
            </Chip>
          ))}
        </div>
      )}

      {!user && (
        <p className="text-13 text-muted">
          <Link to="/session">Sign in</Link> to react, comment or fork.
        </p>
      )}
    </Card>
  )
}
