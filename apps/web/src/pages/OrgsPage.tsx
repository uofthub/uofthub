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

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function CreateOrgDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', slug: '', type: 'CLUB', description: '', websiteUrl: '' })

  const mutation = useMutation({
    mutationFn: () =>
      api.orgs.create({
        name: form.name,
        slug: form.slug || slugify(form.name),
        type: form.type,
        description: form.description || undefined,
        websiteUrl: form.websiteUrl || undefined,
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
        <Field label="URL slug" hint={`uofthub.ca/orgs/${form.slug || slugify(form.name) || '…'}`}>
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
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={() => mutation.mutate()} disabled={!form.name.trim() || mutation.isPending}>
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
            background: `color-mix(in srgb, var(--v-${lab ? 'purple' : 'blue'}-base) 20%, transparent)`,
          }}
        >
          <Icon name={lab ? 'mdi-flask-outline' : 'mdi-account-group-outline'} size={24} color={`var(--v-${lab ? 'purple' : 'blue'}-base)`} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="overflow-ellipsis" style={{ fontSize: '1.0625rem', fontWeight: 500 }}>
            {org.name}
          </h3>
          <Chip small color={lab ? 'purple' : 'blue'}>
            {lab ? 'Research Lab' : 'Club'}
          </Chip>
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

      {isLoading ? (
        <Spinner />
      ) : orgs.length === 0 ? (
        <EmptyState icon="mdi-account-group-outline" title="No clubs or labs yet." />
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {orgs.map(org => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  )
}
