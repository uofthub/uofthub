import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, type Org } from '../lib/api'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import {
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
  PageHeader,
  SelectField,
  Spinner,
  TextArea,
  TextField,
} from '../components/ui'
import { ORG_STATUS_COLORS, ORG_STATUS_LABELS, VERIFICATION_WINDOW_DAYS, daysUntil } from '../lib/orgs'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function CreateOrgDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    slug: '',
    type: 'CLUB',
    description: '',
    websiteUrl: '',
    discordUrl: '',
    groupMeUrl: '',
    contactEmail: '',
    contactRole: '',
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.orgs.create({
        name: form.name,
        slug: form.slug || slugify(form.name),
        type: form.type,
        description: form.description || undefined,
        websiteUrl: form.websiteUrl || undefined,
        discordUrl: form.discordUrl || undefined,
        groupMeUrl: form.groupMeUrl || undefined,
        contactEmail: form.contactEmail,
        contactRole: form.contactRole,
      }),
    onSuccess: org => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      onClose()
      navigate(`/orgs/${org.slug}`)
    },
  })

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog onClose={onClose}>
      <DialogTitle onClose={onClose}>New club or lab</DialogTitle>
      <div style={{ padding: 22, display: 'grid', gap: 16 }}>
        <Field label="Name">
          <TextField value={form.name} onChange={set('name')} placeholder="UofT Robotics Association" />
        </Field>
        <Field label="URL slug" hint={`uofthub.com/orgs/${form.slug || slugify(form.name) || '…'}`}>
          <TextField value={form.slug} onChange={set('slug')} placeholder={slugify(form.name) || 'uofT-robotics'} />
        </Field>
        <Field label="Type">
          <SelectField value={form.type} onChange={set('type')}>
            <option value="CLUB">Club or design team</option>
            <option value="LAB">Research lab</option>
          </SelectField>
        </Field>
        <Field label="Description">
          <TextArea rows={3} value={form.description} onChange={set('description')} placeholder="What does the group do?" />
        </Field>
        <Field label="Website">
          <TextField value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://…" />
        </Field>
        <Field label="Discord invite" hint="Optional. A discord.gg or discord.com link.">
          <TextField value={form.discordUrl} onChange={set('discordUrl')} placeholder="https://discord.gg/…" />
        </Field>
        <Field label="GroupMe" hint="Optional. A groupme.com share link.">
          <TextField value={form.groupMeUrl} onChange={set('groupMeUrl')} placeholder="https://groupme.com/join_group/…" />
        </Field>

        <Divider />
        <p className="text--secondary" style={{ fontSize: '0.875rem', margin: 0 }}>
          A group page is a claim that you represent the group, so it stays private until we can check it. You
          have {VERIFICATION_WINDOW_DAYS} days after creating it to submit something that shows your authorization
          — otherwise it is deleted automatically.
        </p>
        <Field label="Your role in the group">
          <TextField value={form.contactRole} onChange={set('contactRole')} placeholder="President, lab manager, …" />
        </Field>
        <Field label="Contact email" hint="Where the verification decision is sent.">
          <TextField
            type="email"
            value={form.contactEmail}
            onChange={set('contactEmail')}
            placeholder="exec@mail.utoronto.ca"
          />
        </Field>
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          variant="accent"
          onClick={() => mutation.mutate()}
          disabled={
            !form.name.trim() || !form.contactEmail.trim() || !form.contactRole.trim() || mutation.isPending
          }
        >
          {mutation.isPending ? 'Creating…' : 'Create'}
        </Btn>
      </div>
    </Dialog>
  )
}

function OrgCard({ org }: { org: Org }) {
  const lab = org.type === 'LAB'
  return (
    <Card hover to={`/orgs/${org.slug}`} style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `color-mix(in srgb, var(--tone-${lab ? 'purple' : 'blue'}) 20%, transparent)`,
          }}
        >
          <Icon name={lab ? 'mdi-flask-outline' : 'mdi-account-group-outline'} size={24} color={`var(--tone-${lab ? 'purple' : 'blue'})`} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="overflow-ellipsis" style={{ fontSize: '1.0625rem', fontWeight: 500 }}>
            {org.name}
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip small color={lab ? 'purple' : 'blue'}>
              {lab ? 'Research Lab' : 'Club'}
            </Chip>
            {org.status !== 'VERIFIED' && (
              <Chip small color={ORG_STATUS_COLORS[org.status]}>
                {ORG_STATUS_LABELS[org.status]}
              </Chip>
            )}
          </div>
        </div>
      </div>
      {org.description && (
        <p
          className="text--secondary"
          style={{
            fontSize: '0.9rem',
            marginTop: 12,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {org.description}
        </p>
      )}
      {org._count && (
        <div className="text--disabled" style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: '0.8125rem' }}>
          <span>{org._count.members} members</span>
          <span>{org._count.projects} projects</span>
        </div>
      )}
    </Card>
  )
}

/** Directory of clubs, design teams and research labs. */
export default function OrgsPage() {
  usePageCrumbs([{ text: 'Clubs & Labs', href: '/orgs' }])
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)

  const { data: orgs = [], isLoading } = useQuery({ queryKey: ['orgs'], queryFn: () => api.orgs.list() })

  // The API only ever returns an unverified group to its own members, so
  // anything here that isn't VERIFIED is one of yours — it is listed
  // separately rather than mixed into the directory, which is public.
  const verified = orgs.filter(o => o.status === 'VERIFIED')
  const mine = orgs.filter(o => o.status !== 'VERIFIED')

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32 }}>
      {creating && <CreateOrgDialog onClose={() => setCreating(false)} />}

      <PageHeader
        title="Clubs & Labs"
        subtitle="Design teams, student clubs and research groups, and everything their members have published."
        actions={
          user && (
            <Btn variant="accent" onClick={() => setCreating(true)}>
              <Icon name="mdi-plus" color="#fff" />
              New group
            </Btn>
          )
        }
      />

      {mine.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: 4 }}>Your groups, not yet public</h2>
          <p className="text--secondary" style={{ fontSize: '0.875rem' }}>
            Only you and the other members can see these until they are verified.
          </p>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {mine.map(org => {
              const left = daysUntil(org.verificationDeadline)
              return (
                <div key={org.id}>
                  <OrgCard org={org} />
                  {left !== null && (
                    <p
                      style={{
                        fontSize: '0.8125rem',
                        margin: '6px 2px 0',
                        color: left <= 2 ? 'var(--tone-error)' : 'var(--text-secondary)',
                      }}
                    >
                      <Icon name="mdi-clock-outline" size={14} />{' '}
                      {left > 0 ? `${left} day${left === 1 ? '' : 's'} left to verify` : 'Verification window closed'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {isLoading ? (
        <Spinner />
      ) : verified.length === 0 ? (
        <EmptyState icon="mdi-account-group-outline" title="No verified clubs or labs yet." />
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {verified.map(org => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  )
}
