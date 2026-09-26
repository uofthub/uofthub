import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  Chip,
  ErrorText,
  Icon,
  Menu,
  MenuDivider,
  MenuItem,
  type AvatarPerson,
  type IconName,
} from '../../components/ui'
import {
  FilesDialog,
  InsightsDialog,
  InviteDialog,
  LinksDialog,
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
  | 'update'
  | 'links'
  | 'files'
  | 'invite'
  | 'groups'
  | 'insights'
  | 'report'
  | 'collect'
  | null

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
    <div className="row" style={{ gap: 12 }}>
      <Link to={`/u/${person.id}`} tabIndex={-1} aria-hidden="true">
        <Avatar person={person} size={44} />
      </Link>
      <div className="grow">
        <Link to={`/u/${person.id}`} className="person-name">
          {person.name}
        </Link>
        {line && <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>{line}</div>}
        {sub && (
          <div className="muted" style={{ fontSize: 13 }}>
            {sub}
          </div>
        )}
      </div>
      {follow.canFollow && (
        <Button
          size="sm"
          onClick={follow.toggle}
          disabled={follow.pending}
          style={{ fontSize: 13, padding: '0 12px' }}
        >
          {follow.following ? 'Following' : 'Follow'}
        </Button>
      )}
    </div>
  )
}

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
  const [open, setOpen] = useState<Open>(null)
  // The only way pinning fails is the six-project cap, and that has to be
  // said out loud — a button that quietly does nothing reads as a bug.
  const [pinError, setPinError] = useState<string | null>(null)

  const isOwner = user?.id === project.ownerId
  const outputs = resolveOutputs(project)
  const primary = primaryOutput(outputs)
  const [viewing, setViewing] = useState<string | null>(null)
  const previewable = project.files.filter((f) => previewKindFor(f.name))
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
  const tags = topicTags(project.tags)
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
  const requestAccess = useMutation({ mutationFn: () => api.projects.requestAccess(project.id) })

  return (
    <section className="card info-card">
      {viewing && (
        <FileViewer
          projectId={project.id}
          files={previewable}
          fileId={viewing}
          onSelect={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
      {open === 'update' && <UpdateDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'groups' && <GroupsDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'links' && <LinksDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'files' && <FilesDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'invite' && <InviteDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'insights' && (
        <InsightsDialog projectId={project.id} onClose={() => setOpen(null)} />
      )}
      {open === 'report' && <ReportDialog projectId={project.id} onClose={() => setOpen(null)} />}
      {open === 'collect' && (
        <AddToCollectionDialog projectId={project.id} onClose={() => setOpen(null)} />
      )}

      <div className="row" style={{ gap: 8, minHeight: 22 }}>
        <TypeBadge type={project.type} />
        <StatusPill status={project.status} />
        <VisibilityPill visibility={project.visibility} />
        {!!project.pinnedAt && isOwner && (
          <Chip size="sm" tone="navy" icon="pin">
            Pinned
          </Chip>
        )}
        {latest && (
          <span className="muted push" style={{ fontSize: 13 }}>
            v{latest.versionNum}
          </span>
        )}
      </div>

      <div>
        <h1 className="disp info-card__title">{project.title}</h1>
        {pitch && <p className="info-card__pitch">{pitch}</p>}
        {project.forkedFromId && (
          <p className="muted row" style={{ gap: 6, fontSize: 13, marginTop: 8 }}>
            <Icon name="fork" size={14} /> Forked from{' '}
            <Link to={`/projects/${project.forkedFromId}`}>another project</Link>
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
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
        ) : isOwner ? (
          <Button variant="primary" icon="link" onClick={() => setOpen('links')} className="grow">
            Add a live link
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
              {isOwner && (
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
                  <MenuItem icon="userPlus" onSelect={() => setOpen('invite')} close={close}>
                    Invite a collaborator
                  </MenuItem>
                  <MenuItem icon="users" onSelect={() => setOpen('groups')} close={close}>
                    Link to a group
                  </MenuItem>
                  <MenuItem icon="pin" onSelect={() => pin.mutate()} close={close}>
                    {project.pinnedAt ? 'Unpin from profile' : 'Pin to profile'}
                  </MenuItem>
                  <MenuItem icon="send" onSelect={() => setOpen('update')} close={close}>
                    Post an update
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
              {user && !isOwner && (
                <>
                  <MenuItem icon="fork" onSelect={() => fork.mutate()} close={close}>
                    Fork a copy
                  </MenuItem>
                  {user.role === 'FACULTY' && (
                    <MenuItem
                      icon="lock"
                      onSelect={() => requestAccess.mutate()}
                      disabled={requestAccess.isSuccess}
                      close={close}
                    >
                      {requestAccess.isSuccess ? 'Access requested' : 'Request access'}
                    </MenuItem>
                  )}
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

      <ReactionBar project={project} />

      <hr />

      <div className="stack" style={{ gap: 14 }}>
        <span className="lbl">Made by</span>
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
          <Maker key={c.user.id} person={c.user} line="Collaborator" />
        ))}
        {isOwner && (
          <button type="button" className="link-btn" onClick={() => setOpen('invite')}>
            + Invite a collaborator
          </button>
        )}
      </div>

      <hr />

      <dl className="facts">
        {course && (
          <>
            <dt className="muted">Course</dt>
            <dd>
              <Link
                to={`/explore?course=${encodeURIComponent(course)}`}
                style={{ fontWeight: 600 }}
              >
                Built for {course}
              </Link>
            </dd>
          </>
        )}
        {/* The author's own facts — Supervisor, Runtime, Performers — in
            their order. The API drops a row missing either side. */}
        {(project.details ?? []).map((d, i) => (
          <Fragment key={`${d.label}-${i}`}>
            <dt className="muted">{d.label}</dt>
            <dd style={{ overflowWrap: 'anywhere' }}>{d.value}</dd>
          </Fragment>
        ))}
        {project.owner?.campus && (
          <>
            <dt className="muted">Campus</dt>
            <dd>{campusShort(project.owner.campus)}</dd>
          </>
        )}
        {project.orgProjects.length > 0 && (
          <>
            <dt className="muted">Built with</dt>
            <dd className="row wrap" style={{ gap: 12 }}>
              {project.orgProjects.map(({ org }) => (
                <Link
                  key={org.slug}
                  to={`/orgs/${org.slug}`}
                  className="row"
                  style={{ gap: 4, fontWeight: 600 }}
                >
                  <Icon name={org.type === 'LAB' ? 'flask' : 'users'} size={14} />
                  {org.name}
                </Link>
              ))}
            </dd>
          </>
        )}
        <dt className="muted">Posted</dt>
        <dd>
          {timeAgo(posted)}
          {edited && ` · updated ${timeAgo(project.updatedAt)}`}
        </dd>
        {outputs.length > 0 && (
          <>
            <dt className="muted">Outputs</dt>
            <dd className="stack" style={{ gap: 6 }}>
              {outputs.map((o) => {
                const { href, onClick } = target(o)
                const body = (
                  <>
                    <Icon name={OUTPUT_KINDS[o.kind].icon} size={14} />
                    <span className="clamp-1">{outputLabel(o)}</span>
                    {o.primary && <span className="muted">· main</span>}
                  </>
                )
                return href ? (
                  <a
                    key={o.id}
                    href={href}
                    className="row"
                    style={{ gap: 4 }}
                    {...(o.link && { target: '_blank', rel: 'noopener noreferrer' })}
                  >
                    {body}
                  </a>
                ) : (
                  <button
                    key={o.id}
                    type="button"
                    className="link-btn row"
                    style={{ gap: 4, justifyContent: 'flex-start' }}
                    onClick={onClick}
                  >
                    {body}
                  </button>
                )
              })}
            </dd>
          </>
        )}
        {links.length > 0 && (
          <>
            <dt className="muted">Links</dt>
            <dd className="row wrap" style={{ gap: 12 }}>
              {links.map((l) => (
                <a
                  key={l.id}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="row"
                  style={{ gap: 4 }}
                >
                  <Icon name={LINK_ICONS[l.role]} size={14} />
                  {l.label || 'Link'}
                </a>
              ))}
            </dd>
          </>
        )}
        {documents.length > 0 && (
          <>
            <dt className="muted">Files</dt>
            <dd className="stack" style={{ gap: 4 }}>
              {documents.map((f) => (
                <a
                  key={f.id}
                  href={api.projects.downloadUrl(project.id, f.id)}
                  className="row"
                  style={{ gap: 4 }}
                >
                  <Icon name="download" size={14} />
                  <span className="clamp-1">{f.name}</span>
                </a>
              ))}
            </dd>
          </>
        )}
      </dl>

      {tags.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
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

      {!user && (
        <p className="muted" style={{ fontSize: 13 }}>
          <Link to="/session">Sign in</Link> to react, comment or fork.
        </p>
      )}
    </section>
  )
}
