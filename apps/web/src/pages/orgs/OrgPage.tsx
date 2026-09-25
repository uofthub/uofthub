import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, safeUrl, type OrgDetail } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { CAMPUS_OPTIONS, campusShort } from '../../lib/campus'
import { useDocumentTitle } from '../../lib/hooks'
import { CONTACT_EMAIL } from '../../lib/site'
import { ORG_STATUS_DOTS, ORG_STATUS_LABELS } from '../../lib/orgs'
import {
  Avatar,
  Button,
  Chip,
  Dialog,
  EmptyState,
  ErrorText,
  Field,
  Icon,
  Input,
  Panel,
  Pill,
  Select,
  Spinner,
  TextArea,
} from '../../components/ui'
import './orgs.css'

function EditOrgDialog({ org, onClose }: { org: OrgDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    description: org.description ?? '',
    campus: org.campus ?? '',
    websiteUrl: org.websiteUrl ?? '',
    discordUrl: org.discordUrl ?? '',
    groupMeUrl: org.groupMeUrl ?? '',
  })
  const save = useMutation({
    mutationFn: () => api.orgs.update(org.slug, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', org.slug] })
      onClose()
    },
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <Dialog
      title="Edit group"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Description">
        <TextArea rows={4} value={form.description} onChange={set('description')} />
      </Field>
      <Field label="Campus">
        <Select value={form.campus} onChange={set('campus')}>
          <option value="">All three campuses</option>
          {CAMPUS_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Website">
        <Input value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://" />
      </Field>
      <Field label="Discord invite">
        <Input
          value={form.discordUrl}
          onChange={set('discordUrl')}
          placeholder="https://discord.gg/…"
        />
      </Field>
      <Field label="GroupMe">
        <Input
          value={form.groupMeUrl}
          onChange={set('groupMeUrl')}
          placeholder="https://groupme.com/join_group/…"
        />
      </Field>
      {save.isError && <ErrorText>{(save.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

function ActivityDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    link: '',
    imageUrl: '',
  })
  const post = useMutation({
    mutationFn: () =>
      api.orgs.addActivity(slug, {
        title: form.title,
        description: form.description || undefined,
        date: form.date || undefined,
        link: form.link || undefined,
        imageUrl: form.imageUrl || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', slug] })
      onClose()
    },
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <Dialog
      title="Post an event"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => post.mutate()}
            disabled={!form.title.trim() || post.isPending}
          >
            {post.isPending ? 'Posting…' : 'Post'}
          </Button>
        </>
      }
    >
      <Field label="Title">
        <Input value={form.title} onChange={set('title')} placeholder="Intro to CAD workshop" />
      </Field>
      <Field label="Description">
        <TextArea rows={3} value={form.description} onChange={set('description')} />
      </Field>
      <Field label="Date">
        <Input type="date" value={form.date} onChange={set('date')} />
      </Field>
      <Field label="Link" hint="Optional — signup form, recap, photos.">
        <Input value={form.link} onChange={set('link')} placeholder="https://" />
      </Field>
      <Field label="Image URL" hint="Optional — a poster or photo.">
        <Input value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://" />
      </Field>
      {post.isError && <ErrorText>{(post.error as Error).message}</ErrorText>}
    </Dialog>
  )
}

type Open = 'edit' | 'activity' | null

/** One group's page. */
export default function OrgPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState<Open>(null)
  const [email, setEmail] = useState('')

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => api.orgs.get(slug!),
    enabled: !!slug,
  })
  useDocumentTitle(org?.name)

  const addMember = useMutation({
    mutationFn: () => api.orgs.addMember(slug!, email.trim()),
    onSuccess: () => {
      setEmail('')
      qc.invalidateQueries({ queryKey: ['org', slug] })
    },
  })
  const removeActivity = useMutation({
    mutationFn: (id: string) => api.orgs.deleteActivity(slug!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', slug] }),
  })

  if (isLoading) return <Spinner />
  if (!org) {
    return (
      <div className="page">
        <EmptyState
          icon="users"
          title="No group here"
          action={<Button to="/orgs">All clubs &amp; labs</Button>}
        />
      </div>
    )
  }

  const membership = org.members.find((m) => m.userId === me?.id)
  const isMember = !!membership
  const isAdmin = membership?.role === 'ADMIN'
  const lab = org.type === 'LAB'
  const website = safeUrl(org.websiteUrl)
  const discord = safeUrl(org.discordUrl)
  const groupMe = safeUrl(org.groupMeUrl)

  return (
    <div className="page page--wide stack" style={{ gap: 28 }}>
      {open === 'edit' && <EditOrgDialog org={org} onClose={() => setOpen(null)} />}
      {open === 'activity' && <ActivityDialog slug={org.slug} onClose={() => setOpen(null)} />}

      {/* Only a group left over from the old self-serve flow can be here
          unverified — and only its members can see it. */}
      {org.status !== 'VERIFIED' && (
        <div className="notice notice--gold" style={{ margin: 0 }}>
          <Icon name="shieldCheck" size={20} />
          <div className="grow">
            <b>Waiting for a moderator</b>
            <p>
              Only members can see this page until a moderator approves it. Questions? Email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </div>
      )}

      <section className="card stack" style={{ padding: 28, gap: 14 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Chip size="sm" tone="navy" icon={lab ? 'flask' : 'users'}>
            {lab ? 'Research lab' : 'Club'}
          </Chip>
          <Chip size="sm" icon="mapPin">
            {campusShort(org.campus) ?? 'All three campuses'}
          </Chip>
          <Pill dot={ORG_STATUS_DOTS[org.status]}>{ORG_STATUS_LABELS[org.status]}</Pill>
          {isAdmin && (
            <Button size="sm" icon="pen" className="push" onClick={() => setOpen('edit')}>
              Edit
            </Button>
          )}
        </div>
        <h1 className="page-title">{org.name}</h1>
        {org.description && (
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--ink-3)', maxWidth: 760 }}>
            {org.description}
          </p>
        )}
        <div className="row wrap" style={{ gap: 10 }}>
          {website && (
            <Button size="md" icon="globe" href={website}>
              Website
            </Button>
          )}
          {discord && (
            <Button size="md" icon="comment" href={discord}>
              Join the Discord
            </Button>
          )}
          {groupMe && (
            <Button size="md" icon="comment" href={groupMe}>
              Join the GroupMe
            </Button>
          )}
        </div>
        <div
          className="profile__stats"
          style={{
            display: 'flex',
            gap: 40,
            padding: '14px 0 0',
            borderTop: '1px solid var(--line)',
          }}
        >
          {[
            [org.members.length, 'Members'],
            [org.projects.length, 'Projects'],
            [org.activities.length, 'Events'],
          ].map(([n, label]) => (
            <div key={label}>
              <div className="disp" style={{ fontSize: 24, fontWeight: 700 }}>
                {n}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="org-layout">
        <div className="stack" style={{ gap: 24, minWidth: 0 }}>
          <Panel
            title="Events"
            size="main"
            action={
              isMember && (
                <Button size="sm" icon="plus" onClick={() => setOpen('activity')}>
                  Post an event
                </Button>
              )
            }
          >
            {org.activities.length === 0 ? (
              <p className="muted">Nothing posted yet.</p>
            ) : (
              org.activities.map((a) => {
                const href = safeUrl(a.link)
                const img = safeUrl(a.imageUrl)
                return (
                  <div key={a.id} className="activity">
                    {img ? (
                      <img src={img} alt="" />
                    ) : (
                      <span
                        className="event-icon"
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          background: 'var(--gold-tint)',
                          color: 'var(--gold-ink)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="calendar" size={20} />
                      </span>
                    )}
                    <div className="grow">
                      <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                        <b style={{ fontSize: 16 }}>{a.title}</b>
                        <span className="muted" style={{ fontSize: 13 }}>
                          {new Date(a.date).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {(isAdmin || a.createdById === me?.id) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            iconOnly
                            icon="trash"
                            className="push"
                            aria-label={`Delete ${a.title}`}
                            onClick={() => removeActivity.mutate(a.id)}
                          />
                        )}
                      </div>
                      {a.description && (
                        <p
                          style={{
                            fontSize: 15,
                            color: 'var(--ink-3)',
                            marginTop: 4,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {a.description}
                        </p>
                      )}
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="row"
                          style={{ gap: 4, fontSize: 14, marginTop: 6 }}
                        >
                          <Icon name="external" size={14} /> More
                        </a>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </Panel>

          <Panel title="Projects" size="main">
            {org.projects.length === 0 ? (
              <p className="muted">No projects linked to this group yet.</p>
            ) : (
              org.projects.map(({ project }) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="mini-row"
                  style={{ alignItems: 'flex-start' }}
                >
                  <span className="stack" style={{ gap: 3 }}>
                    <b style={{ fontSize: 16 }}>{project.title}</b>
                    <span className="muted" style={{ fontSize: 14 }}>
                      {[project.pitch, project.owner.name].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </Panel>
        </div>

        <aside className="stack" style={{ gap: 20 }}>
          <Panel title="Members">
            {org.members.map((m) => (
              <Link
                key={m.userId}
                to={`/u/${m.userId}`}
                className="row"
                style={{ gap: 10, color: 'var(--ink)' }}
              >
                <Avatar
                  person={{ id: m.userId, name: m.user.name, avatarUrl: m.user.avatarUrl }}
                  size={36}
                />
                <span className="grow">
                  <b style={{ fontWeight: 600, fontSize: 15, display: 'block' }}>{m.user.name}</b>
                  {m.user.faculty && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {m.user.faculty}
                    </span>
                  )}
                </span>
                <span className="muted" style={{ fontSize: 13, textTransform: 'capitalize' }}>
                  {m.role.toLowerCase()}
                </span>
              </Link>
            ))}
            {isAdmin && (
              <form
                className="row"
                style={{ gap: 8 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  if (email.trim()) addMember.mutate()
                }}
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Add by email"
                />
                <Button
                  type="submit"
                  iconOnly
                  icon="plus"
                  aria-label="Add member"
                  disabled={!email.trim() || addMember.isPending}
                />
              </form>
            )}
            {addMember.isError && <ErrorText>{(addMember.error as Error).message}</ErrorText>}
          </Panel>
        </aside>
      </div>
    </div>
  )
}
