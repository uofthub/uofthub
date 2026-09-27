import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ProjectDetail, type ProjectPerson } from '../../lib/api'
import { formatBytes, lookFor, previewKindFor } from '../../lib/files'
import { safeLinks, LINK_ICONS, timeAgo } from '../../lib/projectView'
import { REACTIONS, reactionLabel } from '../../lib/reactions'
import { HELP_NEEDED_MAX } from '../../lib/projectMeta'
import {
  Avatar,
  Button,
  cx,
  Dialog,
  Dropzone,
  ErrorText,
  Eyebrow,
  Field,
  Icon,
  Input,
  Spinner,
  Stat,
  SuccessText,
  TextArea,
} from '../../components/ui'

/** A list of things the owner can remove or toggle, one outlined row each. */
function ManageList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2">{children}</ul>
}

/** One row of a ManageList: an icon, what it is, and the action on it. */
function ManageRow({
  as: Tag = 'li',
  icon,
  children,
  action,
}: {
  as?: 'li' | 'div'
  icon: ReactNode
  children: ReactNode
  action: ReactNode
}) {
  return (
    <Tag className="flex items-center gap-2.5 rounded-btn border border-line px-2.5 py-2">
      {icon}
      <span className="flex min-w-0 grow flex-col">{children}</span>
      {action}
    </Tag>
  )
}

/** A dialog's opening line, saying what the dialog is for. */
function Intro({ children }: { children: ReactNode }) {
  return <p className="text-14 text-muted">{children}</p>
}

const invalidate = (qc: ReturnType<typeof useQueryClient>, id: string) =>
  qc.invalidateQueries({ queryKey: ['project', id] })

/* --------------------------------- update ---------------------------------- */

/**
 * "Post an update" — a line about what changed, saved with a snapshot of the
 * project as a new version. It is what the project's Updates timeline shows.
 */
export function UpdateDialog({
  project,
  onClose,
}: {
  project: Pick<ProjectDetail, 'id' | 'title'>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const post = useMutation({
    mutationFn: () => api.projects.createVersion(project.id, note.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versions', project.id] })
      onClose()
    },
  })

  return (
    <Dialog
      title={`Post an update to ${project.title}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="send"
            onClick={() => post.mutate()}
            disabled={!note.trim() || post.isPending}
          >
            {post.isPending ? 'Posting…' : 'Post update'}
          </Button>
        </>
      }
    >
      <Field
        label="What changed?"
        hint="One line — it goes on the project’s Updates timeline, saved as a new version."
      >
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          placeholder="Added Gerstein Library and a quiet-floors filter"
          autoFocus
        />
      </Field>
      {post.isError && <ErrorText>{(post.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* ------------------------------- help needed ------------------------------- */

/**
 * "Looking for help — with what?" Saving marks the project as looking for
 * help, which is what puts it in the Looking for help list; what it says is
 * shown there, on the card, and at the top of the project.
 */
export function HelpNeededDialog({
  project,
  onClose,
  onSaved,
}: {
  project: Pick<ProjectDetail, 'id' | 'title' | 'helpNeeded' | 'status'>
  onClose: () => void
  onSaved?: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState(project.helpNeeded ?? '')
  const asking = project.status === 'HELP_WANTED'
  const save = useMutation({
    mutationFn: (stop: boolean) =>
      api.projects.update(
        project.id,
        stop ? { status: 'IN_PROGRESS' } : { status: 'HELP_WANTED', helpNeeded: text.trim() }
      ),
    onSuccess: () => {
      invalidate(qc, project.id)
      qc.invalidateQueries({ queryKey: ['versions', project.id] })
      qc.invalidateQueries({ queryKey: ['facets'] })
      onSaved?.()
      onClose()
    },
  })

  return (
    <Dialog
      title={`Ask for help on ${project.title}`}
      onClose={onClose}
      footer={
        <>
          {asking && (
            <Button className="mr-auto" onClick={() => save.mutate(true)} disabled={save.isPending}>
              No longer looking
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="megaphone"
            onClick={() => save.mutate(false)}
            disabled={!text.trim() || save.isPending}
          >
            {save.isPending ? 'Saving…' : asking ? 'Save' : 'Ask for help'}
          </Button>
        </>
      }
    >
      <Field
        label="What do you need help with?"
        hint="Who you’re looking for and what they’d do. It shows on the card in Looking for help."
      >
        <TextArea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={HELP_NEEDED_MAX}
          placeholder="A React developer for the map view, a few hours a week until April"
          autoFocus
        />
      </Field>
      {save.isError && <ErrorText>{(save.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* ---------------------------------- links ---------------------------------- */

export function LinksDialog({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const add = useMutation({
    mutationFn: () => api.projects.addLink(project.id, { label: label.trim(), url: url.trim() }),
    onSuccess: () => {
      setLabel('')
      setUrl('')
      invalidate(qc, project.id)
    },
  })
  const remove = useMutation({
    mutationFn: (linkId: string) => api.projects.deleteLink(project.id, linkId),
    onSuccess: () => invalidate(qc, project.id),
  })
  const links = safeLinks(project.links)

  return (
    <Dialog title="Links" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <Intro>
        A live site becomes the “Try it live” button, a GitHub link becomes “View code”, a YouTube
        or Vimeo link becomes “Watch”.
      </Intro>
      {links.length > 0 && (
        <ManageList>
          {links.map((l) => (
            <ManageRow
              key={l.id}
              icon={<Icon name={LINK_ICONS[l.role]} size={18} />}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="trash"
                  aria-label={`Remove ${l.label}`}
                  onClick={() => remove.mutate(l.id)}
                />
              }
            >
              <b className="font-semibold">{l.label || 'Link'}</b>
              <span className="line-clamp-1 text-13 text-muted">{l.url}</span>
            </ManageRow>
          ))}
        </ManageList>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim()) add.mutate()
        }}
      >
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label, e.g. Live demo"
          className="w-auto flex-[1_1_150px]"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className="w-auto flex-[2_1_220px]"
        />
        <Button type="submit" icon="plus" disabled={!url.trim() || add.isPending}>
          Add
        </Button>
      </form>
      {add.isError && <ErrorText>{(add.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* ---------------------------------- files ---------------------------------- */

export function FilesDialog({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const upload = useMutation({
    mutationFn: (file: File) => api.projects.uploadFile(project.id, file),
    onSuccess: () => invalidate(qc, project.id),
  })
  const remove = useMutation({
    mutationFn: (fileId: string) => api.projects.deleteFile(project.id, fileId),
    onSuccess: () => invalidate(qc, project.id),
  })

  return (
    <Dialog title="Files" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <Intro>
        Images and videos appear in the gallery; the first image is the cover on cards. Anything
        else is listed for download.
      </Intro>
      {project.files.length > 0 && (
        <ManageList>
          {project.files.map((f) => {
            const look = lookFor(f.name)
            return (
              <ManageRow
                key={f.id}
                icon={
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: look.bg, color: look.ink }}
                  >
                    <Icon name={look.icon} size={16} />
                  </span>
                }
                action={
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon="trash"
                    aria-label={`Delete ${f.name}`}
                    onClick={() => remove.mutate(f.id)}
                  />
                }
              >
                <b className="line-clamp-1 font-semibold">{f.name}</b>
                <span className="text-13 text-muted">
                  {formatBytes(f.sizeBytes)}
                  {!previewKindFor(f.name) && ' · download only'}
                </span>
              </ManageRow>
            )
          })}
        </ManageList>
      )}
      <Dropzone
        icon="upload"
        title={upload.isPending ? 'Uploading…' : 'Upload a file'}
        hint="Images, video, audio, PDFs, documents, slides, spreadsheets or a .zip"
      >
        <input
          type="file"
          className="sr-only"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload.mutate(file)
          }}
        />
      </Dropzone>
      {upload.isError && <ErrorText>{(upload.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

/* --------------------------------- people ---------------------------------- */

/** One person in the People dialog, with whatever the owner can do about them. */
function PersonRow({
  person,
  note,
  children,
}: {
  person: ProjectPerson
  note: string
  children: ReactNode
}) {
  return (
    <ManageRow
      icon={<Avatar person={person.user} size={32} />}
      action={<span className="flex gap-1.5">{children}</span>}
    >
      <Link to={`/u/${person.userId}`} className="text-14 font-semibold text-ink">
        {person.user.name}
      </Link>
      <span className="text-13 text-muted">{[person.title, note].filter(Boolean).join(' · ')}</span>
    </ManageRow>
  )
}

/**
 * Who is on the project, and inviting more: credited collaborators,
 * invitations still waiting, TAs with access and their requests. Owner only.
 */
export function PeopleDialog({
  project,
  onClose,
}: {
  project: ProjectDetail
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const { data: people, isLoading } = useQuery({
    queryKey: ['people', project.id],
    queryFn: () => api.projects.people(project.id),
  })
  const done = () => {
    qc.invalidateQueries({ queryKey: ['people', project.id] })
    invalidate(qc, project.id)
  }
  const invite = useMutation({
    mutationFn: () =>
      api.projects.inviteCollaborator(project.id, email.trim(), title.trim() || undefined),
    onSuccess: () => {
      setEmail('')
      setTitle('')
      done()
    },
  })
  const remove = useMutation({
    mutationFn: (userId: string) => api.projects.removeCollaborator(project.id, userId),
    onSuccess: done,
  })
  const approve = useMutation({
    mutationFn: (userId: string) => api.projects.approveAccessRequest(project.id, userId),
    onSuccess: done,
  })
  const withdraw = useMutation({
    mutationFn: (address: string) => api.projects.cancelEmailInvite(project.id, address),
    onSuccess: done,
  })
  const busy = remove.isPending || approve.isPending || withdraw.isPending
  const error = [invite, remove, approve, withdraw].find((m) => m.isError)?.error

  return (
    <Dialog
      title="People"
      onClose={onClose}
      width={560}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <form
        className="flex flex-wrap items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim()) invite.mutate()
        }}
      >
        <Field label="Invite by U of T email" className="min-w-0 grow basis-56">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@mail.utoronto.ca"
          />
        </Field>
        <Field label="Their role" className="basis-36">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Designer"
            maxLength={40}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          icon="userPlus"
          disabled={!email.trim() || invite.isPending}
        >
          {invite.isPending ? 'Inviting…' : 'Invite'}
        </Button>
      </form>
      <Intro>
        They need a uofthub account first, and they confirm before they appear on the project.
        Collaborators can edit the project’s content; only you choose who can see it.
      </Intro>
      {invite.isSuccess && <SuccessText>Invitation sent.</SuccessText>}
      {error && <ErrorText>{error.message}</ErrorText>}

      {isLoading || !people ? (
        <Spinner />
      ) : (
        <>
          {people.accessRequests.length > 0 && (
            <section className="flex flex-col gap-2">
              <Eyebrow as="h3">Asking for access</Eyebrow>
              <ManageList>
                {people.accessRequests.map((p) => (
                  <PersonRow key={p.userId} person={p} note={p.user.faculty ?? p.user.email}>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      onClick={() => approve.mutate(p.userId)}
                    >
                      Approve
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => remove.mutate(p.userId)}>
                      Deny
                    </Button>
                  </PersonRow>
                ))}
              </ManageList>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <Eyebrow as="h3">Collaborators</Eyebrow>
            {people.collaborators.length === 0 &&
            people.pending.length === 0 &&
            people.emailInvites.length === 0 ? (
              <p className="text-14 text-muted">Nobody yet — just you.</p>
            ) : (
              <ManageList>
                {people.collaborators.map((p) => (
                  <PersonRow key={p.userId} person={p} note="Collaborator">
                    <Button size="sm" disabled={busy} onClick={() => remove.mutate(p.userId)}>
                      Remove
                    </Button>
                  </PersonRow>
                ))}
                {people.pending.map((p) => (
                  <PersonRow key={p.userId} person={p} note={`Invited ${timeAgo(p.invitedAt)}`}>
                    <Button size="sm" disabled={busy} onClick={() => remove.mutate(p.userId)}>
                      Withdraw
                    </Button>
                  </PersonRow>
                ))}
                {people.emailInvites.map((i) => (
                  <ManageRow
                    key={i.email}
                    icon={<Icon name="inbox" size={18} />}
                    action={
                      <Button size="sm" disabled={busy} onClick={() => withdraw.mutate(i.email)}>
                        Withdraw
                      </Button>
                    }
                  >
                    <span className="text-14 font-semibold wrap-anywhere">{i.email}</span>
                    <span className="text-13 text-muted">
                      {[i.title, 'No account yet — invited by email'].filter(Boolean).join(' · ')}
                    </span>
                  </ManageRow>
                ))}
              </ManageList>
            )}
          </section>

          {people.viewers.length > 0 && (
            <section className="flex flex-col gap-2">
              <Eyebrow as="h3">Can view (TAs and instructors)</Eyebrow>
              <ManageList>
                {people.viewers.map((p) => (
                  <PersonRow key={p.userId} person={p} note="Viewer">
                    <Button size="sm" disabled={busy} onClick={() => remove.mutate(p.userId)}>
                      Remove
                    </Button>
                  </PersonRow>
                ))}
              </ManageList>
            </section>
          )}
        </>
      )}
    </Dialog>
  )
}

/* --------------------------------- insights -------------------------------- */

/** Thirty days of views as thin navy bars — one series, so no legend. */
function ViewsChart({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(...days.map((d) => d.count), 1)
  const label = (d: { date: string; count: number }) =>
    `${new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${d.count} view${d.count === 1 ? '' : 's'}`

  return (
    <figure className="flex flex-col gap-2">
      <Eyebrow as="figcaption">Views, last 30 days</Eyebrow>
      <div
        className="flex h-24 items-end border-b border-line"
        role="img"
        aria-label={`Daily views over the last ${days.length} days, peaking at ${max}`}
      >
        {days.map((d) => (
          <span key={d.date} className="group flex h-full flex-1 items-end px-px" title={label(d)}>
            <span
              className="w-full rounded-t-sm bg-navy group-hover:bg-navy-deep"
              style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
            />
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-12 text-muted">
        <span>
          {new Date(days[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        <span>Peak {max}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** The owner's own numbers — the Insights tab of the old page, in a dialog. */
export function InsightsDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['analytics', projectId],
    queryFn: () => api.projects.analytics(projectId),
  })

  const change = data ? data.viewsThisWeek - data.viewsLastWeek : 0
  const said = data ? REACTIONS.filter((r) => data.reactions[r.kind] > 0) : []

  return (
    <Dialog
      title="Insights"
      onClose={onClose}
      width={620}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="flex flex-wrap gap-10 border-b border-line-soft pt-1 pb-3.5">
            {[
              { label: 'Views', value: data.totalViews },
              { label: 'Comments', value: data.comments },
              { label: 'Saves', value: data.saves },
              { label: 'Following', value: data.followers },
            ].map((s) => (
              <Stat key={s.label} value={s.value} label={s.label} />
            ))}
          </div>

          {/* Two adjacent weeks tell "quiet" apart from "slowing down", which a
              lifetime total cannot. */}
          <p className="text-15">
            <b>{data.viewsThisWeek}</b> {data.viewsThisWeek === 1 ? 'view' : 'views'} this week
            {data.viewsLastWeek > 0 && (
              <>
                , against {data.viewsLastWeek} last week
                {change !== 0 && (
                  <span
                    className={cx('font-semibold', change > 0 ? 'text-green-ink' : 'text-muted')}
                  >
                    {' '}
                    ({change > 0 ? '+' : ''}
                    {change})
                  </span>
                )}
              </>
            )}
            .
          </p>

          {data.dailyViews.length > 0 && <ViewsChart days={data.dailyViews} />}
          {/* Without this, an owner testing their own page sees a number that
              never moves and reads it as broken — see api/src/lib/views.ts. */}
          <p className="text-13 text-muted">
            A view is one person in a day, signed in or not. Your own visits aren’t counted.
          </p>

          {said.length > 0 && (
            <p className="text-14 text-muted">
              {said.map((r) => `${data.reactions[r.kind]} ${r.past}`).join(' · ')}.
            </p>
          )}

          {/* The one list nobody else sees: who offered to work on this. */}
          {data.collabInterest.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <Eyebrow as="span">Want to collaborate</Eyebrow>
              {data.collabInterest.map(({ user, createdAt }) => (
                <Link
                  key={user.id}
                  to={`/u/${user.id}`}
                  className="flex items-center gap-2.5 text-ink"
                >
                  <Avatar person={user} size={32} />
                  <span className="min-w-0 grow">
                    <b className="block text-14 font-semibold">{user.name}</b>
                    <span className="text-13 text-muted">
                      {[user.faculty, timeAgo(createdAt)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={16} />
                </Link>
              ))}
            </div>
          )}

          {/* Views are anonymous and stay that way; a reaction is attributed. */}
          {data.recentReactions.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <Eyebrow as="span">Recent reactions</Eyebrow>
              {data.recentReactions.map((r) => (
                <Link
                  key={`${r.user.id}-${r.kind}`}
                  to={`/u/${r.user.id}`}
                  className="flex items-center gap-2 text-14 text-ink-3"
                >
                  <Avatar person={r.user} size={26} />
                  <span>
                    <b className="font-semibold text-ink">{r.user.name}</b> ·{' '}
                    {reactionLabel(r.kind).toLowerCase()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </Dialog>
  )
}

/* --------------------------------- groups ---------------------------------- */

/**
 * "Built with" — link the project to the groups its owner belongs to. It then
 * shows on the project's cards and on the group's page.
 */
export function GroupsDialog({
  project,
  onClose,
}: {
  project: ProjectDetail
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: mine, isLoading } = useQuery({
    queryKey: ['my-orgs'],
    queryFn: () => api.users.myOrgs(),
  })
  const linked = new Set(project.orgProjects.map((o) => o.org.slug))
  const toggle = useMutation({
    mutationFn: (slug: string) =>
      linked.has(slug)
        ? api.orgs.removeProject(slug, project.id)
        : api.orgs.addProject(slug, project.id),
    onSuccess: () => invalidate(qc, project.id),
  })

  return (
    <Dialog title="Built with" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      {isLoading ? (
        <Spinner />
      ) : !mine?.length ? (
        <p className="text-15 leading-normal text-muted">
          You’re not a member of any club or lab yet. Ask your group’s exec to add you from its page
          on{' '}
          <Link to="/orgs" onClick={onClose}>
            Clubs &amp; labs
          </Link>
          .
        </p>
      ) : (
        <>
          <Intro>
            A linked group shows as “Built with …” on this project, and the project appears on the
            group’s page.
          </Intro>
          {mine.map((org) => {
            const on = linked.has(org.slug)
            return (
              <ManageRow
                key={org.slug}
                as="div"
                icon={<Icon name={org.type === 'LAB' ? 'flask' : 'users'} size={18} />}
                action={
                  <Button
                    size="sm"
                    variant={on ? 'default' : 'primary'}
                    icon={on ? 'check' : 'plus'}
                    onClick={() => toggle.mutate(org.slug)}
                    disabled={toggle.isPending}
                  >
                    {on ? 'Linked' : 'Link'}
                  </Button>
                }
              >
                <span className="font-semibold">{org.name}</span>
              </ManageRow>
            )
          })}
        </>
      )}
      {toggle.isError && <ErrorText>{(toggle.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
