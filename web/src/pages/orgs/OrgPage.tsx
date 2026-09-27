import { useState, type ReactNode } from 'react'
import type { OrgActivity } from '@uofthub/types'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, safeUrl, type OrgDetail, type OrgMember, type OrgRole } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { CAMPUS_OPTIONS, campusShort } from '../../lib/campus'
import { useDocumentTitle } from '../../lib/hooks'
import { ReportDialog } from '../../components/project'
import {
  Avatar,
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  ErrorText,
  Eyebrow,
  Field,
  Icon,
  Input,
  Menu,
  MenuItem,
  Page,
  PageTitle,
  Panel,
  Select,
  Spinner,
  Stat,
  TextArea,
  confirmAction,
  toast,
} from '../../components/ui'
import { profilePath, projectPath } from '../../lib/paths'

function EditOrgDialog({ org, onClose }: { org: OrgDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: org.name,
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
  const remove = useMutation({
    mutationFn: () => api.orgs.delete(org.slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      navigate('/orgs', { replace: true })
      toast('Group deleted.')
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
          <Button
            variant="danger"
            className="mr-auto"
            disabled={remove.isPending}
            onClick={async () =>
              (await confirmAction({
                title: `Delete ${org.name}?`,
                body: 'Its page, events and member list go for good. Linked projects stay with their owners.',
                confirmLabel: 'Delete group',
                danger: true,
              })) && remove.mutate()
            }
          >
            Delete group
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={!form.name.trim() || save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={form.name} onChange={set('name')} maxLength={100} />
      </Field>
      <Field label="Description">
        <TextArea
          rows={4}
          maxLength={2000}
          value={form.description}
          onChange={set('description')}
        />
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
      {(save.isError || remove.isError) && (
        <ErrorText>{(save.error ?? remove.error)!.message}</ErrorText>
      )}
    </Dialog>
  )
}

/** Posting an event, or editing one (`activity` given). */
function ActivityDialog({
  slug,
  activity,
  onClose,
}: {
  slug: string
  activity?: OrgActivity
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: activity?.title ?? '',
    description: activity?.description ?? '',
    date: (activity?.date ?? new Date().toISOString()).slice(0, 10),
    link: activity?.link ?? '',
    imageUrl: activity?.imageUrl ?? '',
  })
  const post = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        description: form.description,
        date: form.date || undefined,
        link: form.link,
        imageUrl: form.imageUrl,
      }
      return activity
        ? api.orgs.updateActivity(slug, activity.id, body)
        : api.orgs.addActivity(slug, {
            ...body,
            description: body.description || undefined,
            link: body.link || undefined,
            imageUrl: body.imageUrl || undefined,
          })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', slug] })
      onClose()
    },
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <Dialog
      title={activity ? 'Edit event' : 'Post an event'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => post.mutate()}
            disabled={!form.title.trim() || post.isPending}
          >
            {post.isPending ? 'Saving…' : activity ? 'Save' : 'Post'}
          </Button>
        </>
      }
    >
      <Field label="Title">
        <Input
          value={form.title}
          onChange={set('title')}
          placeholder="Intro to CAD workshop"
          maxLength={120}
        />
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

type Open =
  | { kind: 'edit' }
  | { kind: 'activity'; activity?: OrgActivity }
  | { kind: 'report'; activityId: string }
  | null

/** One person in the Members panel, with what an admin can do about them. */
function MemberRow({
  member,
  note,
  children,
}: {
  member: OrgMember
  note?: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Link
        to={profilePath({ id: member.userId, handle: member.user.handle })}
        className="flex min-w-0 grow items-center gap-2.5 text-ink"
      >
        <Avatar
          person={{ id: member.userId, name: member.user.name, avatarUrl: member.user.avatarUrl }}
          size={36}
        />
        <span className="min-w-0 grow">
          <b className="block text-15 font-semibold">{member.user.name}</b>
          <span className="text-13 text-muted">
            {note ?? (member.role === 'ADMIN' ? 'Admin' : (member.user.faculty ?? 'Member'))}
          </span>
        </span>
      </Link>
      {children}
    </div>
  )
}

/** The Members panel: who is in, and for admins, inviting and deciding. */
function MembersPanel({ org }: { org: OrgDetail }) {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('MEMBER')
  const isAdmin = org.myRole === 'ADMIN'
  const refresh = () => qc.invalidateQueries({ queryKey: ['org', org.slug] })
  const invite = useMutation({
    mutationFn: () => api.orgs.addMember(org.slug, email.trim(), role),
    onSuccess: () => {
      setEmail('')
      refresh()
    },
  })
  const update = useMutation({
    mutationFn: (v: { userId: string; role?: OrgRole; approve?: boolean }) =>
      api.orgs.updateMember(org.slug, v.userId, { role: v.role, approve: v.approve }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => api.orgs.removeMember(org.slug, userId),
    onSuccess: refresh,
  })
  const busy = update.isPending || remove.isPending
  const error = [invite, update, remove].find((m) => m.isError)?.error

  return (
    <Panel title="Members">
      {org.members.map((m) => (
        <MemberRow key={m.userId} member={m}>
          {isAdmin && m.userId !== me?.id && (
            <Menu
              width={200}
              trigger={({ toggle, open }) => (
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="more"
                  aria-label={`Manage ${m.user.name}`}
                  aria-expanded={open}
                  onClick={toggle}
                />
              )}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon="shieldCheck"
                    onSelect={() =>
                      update.mutate({
                        userId: m.userId,
                        role: m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
                      })
                    }
                    close={close}
                  >
                    {m.role === 'ADMIN' ? 'Make a member' : 'Make an admin'}
                  </MenuItem>
                  <MenuItem
                    icon="trash"
                    danger
                    onSelect={async () =>
                      (await confirmAction({
                        title: `Remove ${m.user.name}?`,
                        confirmLabel: 'Remove',
                        danger: true,
                      })) && remove.mutate(m.userId)
                    }
                    close={close}
                  >
                    Remove
                  </MenuItem>
                </>
              )}
            </Menu>
          )}
        </MemberRow>
      ))}

      {isAdmin && (org.requests?.length ?? 0) > 0 && (
        <>
          <Eyebrow as="h3">Asking to join</Eyebrow>
          {org.requests!.map((m) => (
            <MemberRow key={m.userId} member={m} note="Wants to join">
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => update.mutate({ userId: m.userId, approve: true })}
              >
                Approve
              </Button>
              <Button size="sm" disabled={busy} onClick={() => remove.mutate(m.userId)}>
                Deny
              </Button>
            </MemberRow>
          ))}
        </>
      )}

      {isAdmin && (org.invited?.length ?? 0) > 0 && (
        <>
          <Eyebrow as="h3">Invited</Eyebrow>
          {org.invited!.map((m) => (
            <MemberRow key={m.userId} member={m} note={`Invited as ${m.role.toLowerCase()}`}>
              <Button size="sm" disabled={busy} onClick={() => remove.mutate(m.userId)}>
                Withdraw
              </Button>
            </MemberRow>
          ))}
        </>
      )}

      {isAdmin && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (email.trim()) invite.mutate()
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email"
              aria-label="Invite by email"
            />
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
              aria-label="As"
              className="w-30"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </Select>
            <Button
              type="submit"
              iconOnly
              icon="plus"
              aria-label="Invite"
              disabled={!email.trim() || invite.isPending}
            />
          </div>
          <span className="text-13 text-muted">They join once they accept.</span>
        </form>
      )}
      {error && <ErrorText>{error.message}</ErrorText>}
    </Panel>
  )
}

/** Join, ask to join, answer an invitation, or leave — whichever applies. */
function MembershipButton({ org }: { org: OrgDetail }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['org', org.slug] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  const join = useMutation({ mutationFn: () => api.orgs.join(org.slug), onSuccess: refresh })
  const answer = useMutation({
    mutationFn: (accepted: boolean) => api.orgs.answerInvite(org.slug, accepted),
    onSuccess: refresh,
  })
  const leave = useMutation({
    mutationFn: () => api.orgs.removeMember(org.slug, user!.id),
    onSuccess: () => {
      refresh()
      toast(`You left ${org.name}.`)
    },
  })
  const error = [join, answer, leave].find((m) => m.isError)?.error

  if (!user)
    return (
      <Button size="md" to="/session">
        Log in to join
      </Button>
    )
  return (
    <span className="flex flex-wrap items-center gap-2">
      {org.myStatus === null && (
        <Button
          size="md"
          variant="primary"
          icon="userPlus"
          onClick={() => join.mutate()}
          disabled={join.isPending}
        >
          Ask to join
        </Button>
      )}
      {org.myStatus === 'REQUESTED' && (
        <>
          <Chip size="sm">Request sent</Chip>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => leave.mutate()}
            disabled={leave.isPending}
          >
            Cancel
          </Button>
        </>
      )}
      {org.myStatus === 'INVITED' && (
        <>
          <span className="text-14">You’re invited.</span>
          <Button
            size="md"
            variant="primary"
            onClick={() => answer.mutate(true)}
            disabled={answer.isPending}
          >
            Accept
          </Button>
          <Button size="md" onClick={() => answer.mutate(false)} disabled={answer.isPending}>
            Decline
          </Button>
        </>
      )}
      {org.myStatus === 'ACTIVE' && (
        <Button
          size="md"
          variant="ghost"
          icon="logout"
          onClick={async () =>
            (await confirmAction({
              title: `Leave ${org.name}?`,
              confirmLabel: 'Leave group',
            })) && leave.mutate()
          }
          disabled={leave.isPending}
        >
          Leave group
        </Button>
      )}
      {error && <ErrorText>{error.message}</ErrorText>}
    </span>
  )
}

/** One group's page. */
export default function OrgPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState<Open>(null)

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => api.orgs.get(slug!),
    enabled: !!slug,
  })
  useDocumentTitle(org?.name)

  const removeActivity = useMutation({
    mutationFn: (id: string) => api.orgs.deleteActivity(slug!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', slug] }),
  })

  if (isLoading) return <Spinner />
  if (!org) {
    return (
      <Page>
        <EmptyState
          icon="users"
          title="No group here"
          action={<Button to="/orgs">All clubs &amp; labs</Button>}
        />
      </Page>
    )
  }

  const isMember = org.myStatus === 'ACTIVE'
  const isAdmin = org.myRole === 'ADMIN'
  const lab = org.type === 'LAB'
  const website = safeUrl(org.websiteUrl)
  const discord = safeUrl(org.discordUrl)
  const groupMe = safeUrl(org.groupMeUrl)

  return (
    <Page width="wide" className="flex flex-col gap-7">
      {open?.kind === 'edit' && <EditOrgDialog org={org} onClose={() => setOpen(null)} />}
      {open?.kind === 'activity' && (
        <ActivityDialog slug={org.slug} activity={open.activity} onClose={() => setOpen(null)} />
      )}
      {open?.kind === 'report' && (
        <ReportDialog
          target={{ kind: 'activity', slug: org.slug, activityId: open.activityId }}
          onClose={() => setOpen(null)}
        />
      )}

      <Card as="section" className="flex flex-col gap-3.5 p-7">
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" tone="navy" icon={lab ? 'flask' : 'users'}>
            {lab ? 'Research lab' : 'Club'}
          </Chip>
          <Chip size="sm" icon="mapPin">
            {campusShort(org.campus) ?? 'All three campuses'}
          </Chip>
          {(isAdmin || me?.isAdmin) && (
            <Button
              size="sm"
              icon="pen"
              className="ml-auto"
              onClick={() => setOpen({ kind: 'edit' })}
            >
              Edit
            </Button>
          )}
        </div>
        <PageTitle>{org.name}</PageTitle>
        {org.description && (
          <p className="max-w-190 text-17 leading-[1.55] whitespace-pre-wrap text-ink-3">
            {org.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <MembershipButton org={org} />
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
        <div className="flex gap-10 border-y border-line pt-3.5">
          {[
            [org.members.length, 'Members'],
            [org.projects.length, 'Projects'],
            [org.activities.length, 'Events'],
          ].map(([n, label]) => (
            <Stat key={label} value={n} label={label} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title="Events"
            size="main"
            action={
              isMember && (
                <Button size="sm" icon="plus" onClick={() => setOpen({ kind: 'activity' })}>
                  Post an event
                </Button>
              )
            }
          >
            {org.activities.length === 0 ? (
              <p className="text-muted">Nothing posted yet.</p>
            ) : (
              org.activities.map((a) => {
                const href = safeUrl(a.link)
                const img = safeUrl(a.imageUrl)
                const canManage = isAdmin || a.createdById === me?.id
                return (
                  <div key={a.id} className="flex items-start gap-4">
                    {img ? (
                      <img src={img} alt="" className="size-24 shrink-0 rounded-btn object-cover" />
                    ) : (
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-btn bg-gold-tint text-gold-ink">
                        <Icon name="calendar" size={20} />
                      </span>
                    )}
                    <div className="min-w-0 grow">
                      <div className="flex items-baseline gap-2.5">
                        <b className="text-16">{a.title}</b>
                        <span className="text-13 text-muted">
                          {new Date(a.date).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {me && (
                          <span className="ml-auto flex gap-1">
                            {canManage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                iconOnly
                                icon="pen"
                                aria-label={`Edit ${a.title}`}
                                onClick={() => setOpen({ kind: 'activity', activity: a })}
                              />
                            )}
                            {(canManage || me.isAdmin) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                iconOnly
                                icon="trash"
                                aria-label={`Delete ${a.title}`}
                                onClick={async () =>
                                  (await confirmAction({
                                    title: `Delete ${a.title}?`,
                                    confirmLabel: 'Delete',
                                    danger: true,
                                  })) && removeActivity.mutate(a.id)
                                }
                              />
                            )}
                            {a.createdById !== me.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                iconOnly
                                icon="flag"
                                aria-label={`Report ${a.title}`}
                                onClick={() => setOpen({ kind: 'report', activityId: a.id })}
                              />
                            )}
                          </span>
                        )}
                      </div>
                      {a.description && (
                        <p className="mt-1 text-15 whitespace-pre-wrap text-ink-3">
                          {a.description}
                        </p>
                      )}
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 flex items-center gap-1 text-14"
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
              <p className="text-muted">No projects linked to this group yet.</p>
            ) : (
              org.projects.map(({ project }) => (
                <Link
                  key={project.id}
                  to={projectPath(project)}
                  className="flex items-start gap-3 text-ink hover:text-navy-ink"
                >
                  <span className="flex flex-col gap-0.75">
                    <b className="text-16">{project.title}</b>
                    <span className="text-14 text-muted">
                      {[project.pitch, project.owner.name].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </Panel>
        </div>

        <aside className="flex flex-col gap-5">
          <MembersPanel org={org} />
        </aside>
      </div>
    </Page>
  )
}
