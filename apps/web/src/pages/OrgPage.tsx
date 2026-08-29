import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgStatus } from '@uofthub/types'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api, safeUrl, type OrgDetail, type OrgStorage } from '../lib/api'
import { ORG_STATUS_COLORS, ORG_STATUS_LABELS, daysUntil, formatBytes } from '../lib/orgs'
import { CAMPUS_OPTIONS, campusLabel } from '../lib/campus'
import { Stat } from '../components/ProjectCard'
import {
  Avatar,
  Btn,
  Card,
  Chip,
  Dialog,
  DialogTitle,
  Divider,
  EmptyState,
  ErrorText,
  Field,
  Icon,
  SelectField,
  Spinner,
  TextArea,
  TextField,
} from '../components/ui'

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

function VerifyDialog({ org, onClose }: { org: OrgDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState(org.verificationNote ?? '')
  const mutation = useMutation({
    mutationFn: () => api.orgs.verify(org.slug, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', org.slug] })
      qc.invalidateQueries({ queryKey: ['orgs'] })
      onClose()
    },
  })

  return (
    <Dialog onClose={onClose}>
      <DialogTitle onClose={onClose}>Submit verification</DialogTitle>
      <div style={{ padding: 22, display: 'grid', gap: 16 }}>
        <p className="text--secondary" style={{ margin: 0, fontSize: '0.9375rem' }}>
          Tell us how we can confirm you are authorized to run this group. Anything that a person can check
          works: a link to the group on an official U of T or student-union page, a supervisor or staff contact
          who can vouch for you, minutes naming you as an exec, or the group's own site listing you.
        </p>
        {org.reviewNote && (
          <Card style={{ padding: 14, borderLeft: '4px solid var(--tone-yellow)' }}>
            <strong style={{ fontSize: '0.875rem' }}>What the reviewer asked for</strong>
            <p className="text--secondary" style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>
              {org.reviewNote}
            </p>
          </Card>
        )}
        <Field label="Your evidence">
          <TextArea
            rows={6}
            maxLength={2000}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Links, names, roles — whatever shows this is a real group and you speak for it."
          />
        </Field>
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={() => mutation.mutate()} disabled={!note.trim() || mutation.isPending}>
          {mutation.isPending ? 'Submitting…' : 'Submit for review'}
        </Btn>
      </div>
    </Dialog>
  )
}

function EditOrgDialog({ org, onClose }: { org: OrgDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    description: org.description ?? '',
    campus: org.campus ?? '',
    websiteUrl: org.websiteUrl ?? '',
    discordUrl: org.discordUrl ?? '',
    groupMeUrl: org.groupMeUrl ?? '',
  })
  const mutation = useMutation({
    mutationFn: () => api.orgs.update(org.slug, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', org.slug] })
      onClose()
    },
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog onClose={onClose}>
      <DialogTitle onClose={onClose}>Edit group</DialogTitle>
      <div style={{ padding: 22, display: 'grid', gap: 16 }}>
        <Field label="Description">
          <TextArea rows={4} value={form.description} onChange={set('description')} />
        </Field>
        <Field label="Campus" hint="Leave on all three if the group is tri-campus.">
          <SelectField value={form.campus} onChange={set('campus')}>
            <option value="">All three campuses</option>
            {CAMPUS_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Website">
          <TextField value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://…" />
        </Field>
        <Field label="Discord invite" hint="A discord.gg or discord.com link.">
          <TextField value={form.discordUrl} onChange={set('discordUrl')} placeholder="https://discord.gg/…" />
        </Field>
        <Field label="GroupMe" hint="A groupme.com share link.">
          <TextField value={form.groupMeUrl} onChange={set('groupMeUrl')} placeholder="https://groupme.com/join_group/…" />
        </Field>
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Btn>
      </div>
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
  const mutation = useMutation({
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
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog onClose={onClose}>
      <DialogTitle onClose={onClose}>Post an activity</DialogTitle>
      <div style={{ padding: 22, display: 'grid', gap: 16 }}>
        <Field label="Title">
          <TextField value={form.title} onChange={set('title')} placeholder="Intro to CAD workshop" />
        </Field>
        <Field label="Description">
          <TextArea rows={3} value={form.description} onChange={set('description')} />
        </Field>
        <Field label="Date">
          <TextField type="date" value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Link" hint="Optional — signup form, recap doc, photos.">
          <TextField value={form.link} onChange={set('link')} placeholder="https://…" />
        </Field>
        <Field label="Image URL" hint="Optional — a poster or photo to show with it.">
          <TextField value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://…" />
        </Field>
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={() => mutation.mutate()} disabled={!form.title.trim() || mutation.isPending}>
          {mutation.isPending ? 'Posting…' : 'Post'}
        </Btn>
      </div>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

function VerificationBanner({ org, onSubmit }: { org: OrgDetail; onSubmit: () => void }) {
  const left = daysUntil(org.verificationDeadline)
  const urgent = left !== null && left <= 2

  const copy: Record<Exclude<OrgStatus, 'VERIFIED'>, string> = {
    PENDING_VERIFICATION:
      'This page is visible only to your members until we can confirm you represent the group.',
    IN_REVIEW: 'Your submission is with the admin team. Nothing else to do — we email the group contact either way.',
    INFO_REQUESTED: 'We need a bit more before we can verify this group.',
  }

  return (
    <Card
      style={{
        padding: 20,
        marginBottom: 16,
        borderLeft: `4px solid var(--tone-${urgent ? 'error' : ORG_STATUS_COLORS[org.status]})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="mdi-shield-alert-outline" size={20} color={`var(--tone-${ORG_STATUS_COLORS[org.status]})`} />
        <h2 style={{ fontSize: '1rem' }}>{ORG_STATUS_LABELS[org.status]}</h2>
        {left !== null && (
          <Chip small color={urgent ? 'error' : 'grey'}>
            {left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : 'window closed'}
          </Chip>
        )}
      </div>
      <p className="text--secondary" style={{ margin: '8px 0 0', fontSize: '0.9375rem' }}>
        {copy[org.status as Exclude<OrgStatus, 'VERIFIED'>]}
        {left !== null && left > 0 && ' Submit verification before the deadline or the group is deleted automatically.'}
      </p>
      {org.reviewNote && (
        <p className="text--secondary" style={{ margin: '8px 0 0', fontSize: '0.9375rem' }}>
          <strong>Reviewer:</strong> {org.reviewNote}
        </p>
      )}
      {org.status !== 'IN_REVIEW' && (
        <Btn variant="accent" size="small" onClick={onSubmit} style={{ marginTop: 14 }}>
          <Icon name="mdi-file-send-outline" size={16} color="#fff" />
          Submit verification
        </Btn>
      )}
    </Card>
  )
}

function StoragePanel({ storage }: { storage: OrgStorage }) {
  const pct = storage.quotaBytes === 0 ? 0 : Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100)
  return (
    <Card style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontSize: '1.125rem' }}>Group storage</h2>
        <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
          {formatBytes(storage.usedBytes)} of {formatBytes(storage.quotaBytes)}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--v-divider-base)', marginTop: 12 }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 4,
            background: pct > 90 ? 'var(--tone-error)' : 'var(--v-accent-base)',
          }}
        />
      </div>
      <p className="text--disabled" style={{ fontSize: '0.8125rem', margin: '10px 0 0' }}>
        Files on projects linked to this group count here instead of against the uploader's own quota. A fresh
        allowance is granted each academic term and stacks on the terms before it.
      </p>
    </Card>
  )
}

function ActivitiesPanel({
  org,
  isMember,
  myId,
  onAdd,
}: {
  org: OrgDetail
  isMember: boolean
  myId?: string
  onAdd: () => void
}) {
  const qc = useQueryClient()
  const isAdmin = org.members.find(m => m.userId === myId)?.role === 'ADMIN'
  const remove = useMutation({
    mutationFn: (id: string) => api.orgs.deleteActivity(org.slug, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', org.slug] }),
  })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '40px 0 16px' }}>
        <h2>Activities</h2>
        {isMember && (
          <Btn variant="outlined" size="small" onClick={onAdd}>
            <Icon name="mdi-plus" size={16} />
            Post activity
          </Btn>
        )}
      </div>

      {org.activities.length === 0 ? (
        <EmptyState icon="mdi-calendar-blank-outline" title="Nothing posted yet." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {org.activities.map(a => {
            const href = safeUrl(a.link)
            const img = safeUrl(a.imageUrl)
            return (
              <Card key={a.id} style={{ padding: 20, display: 'flex', gap: 16 }}>
                {img && (
                  <img
                    src={img}
                    alt=""
                    style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                  />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.0625rem', fontWeight: 500 }}>{a.title}</h3>
                    <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
                      {new Date(a.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                    <div style={{ flex: 1 }} />
                    {(isAdmin || a.createdById === myId) && (
                      <Btn icon size="small" onClick={() => remove.mutate(a.id)} aria-label={`Delete ${a.title}`}>
                        <Icon name="mdi-delete-outline" size={16} />
                      </Btn>
                    )}
                  </div>
                  {a.description && (
                    <p className="text--secondary" style={{ margin: '6px 0 0', fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>
                      {a.description}
                    </p>
                  )}
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.875rem' }}
                    >
                      <Icon name="mdi-open-in-new" size={15} />
                      More
                    </a>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function OrgPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => api.orgs.get(slug!),
    enabled: !!slug,
  })

  const addMember = useMutation({
    mutationFn: () => api.orgs.addMember(slug!, email),
    onSuccess: () => {
      setEmail('')
      setAdding(false)
      qc.invalidateQueries({ queryKey: ['org', slug] })
    },
  })

  usePageCrumbs([{ text: 'Clubs & Labs', href: '/orgs' }, { text: org?.name ?? 'Group' }])

  if (isLoading) return <Spinner />
  if (!org) return <EmptyState icon="mdi-account-group-outline" title="Organization not found." />

  const isMember = org.members.some(m => m.userId === me?.id)
  const isAdmin = org.members.find(m => m.userId === me?.id)?.role === 'ADMIN'
  const lab = org.type === 'LAB'
  const discord = safeUrl(org.discordUrl)
  const groupMe = safeUrl(org.groupMeUrl)

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 960 }}>
      {verifyOpen && <VerifyDialog org={org} onClose={() => setVerifyOpen(false)} />}
      {editOpen && <EditOrgDialog org={org} onClose={() => setEditOpen(false)} />}
      {activityOpen && <ActivityDialog slug={org.slug} onClose={() => setActivityOpen(false)} />}

      {/* Members only — an unverified page is unreachable for anyone else. */}
      {isAdmin && org.status !== 'VERIFIED' && (
        <VerificationBanner org={org} onSubmit={() => setVerifyOpen(true)} />
      )}

      <Card style={{ padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip color={lab ? 'purple' : 'blue'} small style={{ fontWeight: 700 }}>
              {lab ? 'Research Lab' : 'Club'}
            </Chip>
            <Chip color="grey" small style={{ fontWeight: 700 }}>
              <Icon name="mdi-map-marker-outline" size={14} />
              {campusLabel(org.campus) ?? 'All three campuses'}
            </Chip>
            {org.status === 'VERIFIED' ? (
              <Chip color="green" small style={{ fontWeight: 700 }}>
                <Icon name="mdi-check-decagram" size={14} /> Verified
              </Chip>
            ) : (
              <Chip color={ORG_STATUS_COLORS[org.status]} small style={{ fontWeight: 700 }}>
                {ORG_STATUS_LABELS[org.status]}
              </Chip>
            )}
          </div>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <Btn variant="outlined" size="small" onClick={() => setEditOpen(true)}>
              <Icon name="mdi-pencil-outline" size={16} />
              Edit
            </Btn>
          )}
        </div>

        <h1 style={{ fontSize: '1.75rem', marginTop: 10 }}>{org.name}</h1>
        {org.description && (
          <p className="text--secondary" style={{ marginTop: 10, marginBottom: 0 }}>
            {org.description}
          </p>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          {safeUrl(org.websiteUrl) && (
            <a
              href={safeUrl(org.websiteUrl)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.9375rem' }}
            >
              <Icon name="mdi-open-in-new" size={16} />
              {org.websiteUrl}
            </a>
          )}
          {discord && (
            <a href={discord} target="_blank" rel="noopener noreferrer">
              <Chip small color="purple" clickable>
                <Icon name="mdi-discord" size={15} />
                Join the Discord
              </Chip>
            </a>
          )}
          {groupMe && (
            <a href={groupMe} target="_blank" rel="noopener noreferrer">
              <Chip small color="mint" clickable>
                <Icon name="mdi-message-text-outline" size={15} />
                Join the GroupMe
              </Chip>
            </a>
          )}
        </div>

        <div className="text--disabled" style={{ display: 'flex', gap: 24, marginTop: 20, fontSize: '0.9375rem' }}>
          <span>
            <strong style={{ color: 'var(--v-text-base)' }}>{org.members.length}</strong> members
          </span>
          <span>
            <strong style={{ color: 'var(--v-text-base)' }}>{org.projects.length}</strong> projects
          </span>
          <span>
            <strong style={{ color: 'var(--v-text-base)' }}>{org.activities.length}</strong> activities
          </span>
        </div>
      </Card>

      {isMember && org.storage && <StoragePanel storage={org.storage} />}

      <h2 style={{ margin: '40px 0 16px' }}>Members</h2>
      <Card style={{ padding: 20 }}>
        <ul className="v-list" style={{ display: 'grid', gap: 4 }}>
          {org.members.map(m => (
            <li key={m.userId}>
              <Link to={`/u/${m.userId}`} className="v-list-item" style={{ borderRadius: 6 }}>
                <Avatar name={m.user.name} img={m.user.avatarUrl} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{m.user.name}</div>
                  {m.user.faculty && (
                    <div className="text--disabled" style={{ fontSize: '0.8125rem' }}>
                      {m.user.faculty}
                    </div>
                  )}
                </div>
                <span className="text--disabled" style={{ fontSize: '0.8125rem', textTransform: 'capitalize' }}>
                  {m.role.toLowerCase()}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {isAdmin && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            {adding ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px' }}>
                  <TextField
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="student@mail.utoronto.ca"
                  />
                </div>
                <Btn variant="accent" onClick={() => addMember.mutate()} disabled={!email || addMember.isPending} style={{ height: 44 }}>
                  {addMember.isPending ? 'Adding…' : 'Add'}
                </Btn>
                <Btn onClick={() => setAdding(false)} style={{ height: 44 }}>
                  Cancel
                </Btn>
              </div>
            ) : (
              <Btn onClick={() => setAdding(true)} style={{ color: 'var(--v-accent-base)' }}>
                <Icon name="mdi-plus" />
                Add member
              </Btn>
            )}
            {addMember.isError && <ErrorText>{(addMember.error as Error).message}</ErrorText>}
          </>
        )}
      </Card>

      <ActivitiesPanel org={org} isMember={isMember} myId={me?.id} onAdd={() => setActivityOpen(true)} />

      <h2 style={{ margin: '40px 0 16px' }}>Projects</h2>
      {org.projects.length === 0 ? (
        <EmptyState icon="mdi-folder-open-outline" title="No projects linked to this group yet." />
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {org.projects.map(({ project }) => (
            <Card key={project.id} hover to={`/projects/${project.id}`} style={{ padding: 20 }}>
              <h3 className="overflow-ellipsis" style={{ fontSize: '1.0625rem', fontWeight: 500 }}>
                {project.title}
              </h3>
              {project.description && (
                <p
                  className="text--secondary"
                  style={{
                    fontSize: '0.9rem',
                    margin: '6px 0 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {project.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center' }}>
                <span className="text--secondary" style={{ fontSize: '0.8125rem' }}>
                  {project.owner.name}
                </span>
                <Stat icon="mdi-heart-outline" value={project._count.likes} />
                <Stat icon="mdi-comment-outline" value={project._count.comments} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
