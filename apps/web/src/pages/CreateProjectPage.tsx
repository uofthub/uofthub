import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api } from '../lib/api'
import {
  Btn,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorText,
  Field,
  Icon,
  PageHeader,
  SelectField,
  TextArea,
  TextField,
} from '../components/ui'

const VISIBILITY = [
  { value: 'PRIVATE', label: 'Private — only you', icon: 'mdi-lock-outline' },
  { value: 'UOFT', label: 'U of T only — signed-in students', icon: 'mdi-school-outline' },
  { value: 'PUBLIC', label: 'Public — anyone on the internet', icon: 'mdi-earth' },
]

export default function CreateProjectPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  usePageCrumbs([{ text: 'Projects', href: '/projects' }, { text: 'Share a project' }])

  const [form, setForm] = useState({
    title: '',
    description: '',
    tags: '',
    visibility: 'PRIVATE',
    linkLabel: '',
    linkUrl: '',
  })
  const [links, setLinks] = useState<{ label: string; url: string }[]>([])

  const mutation = useMutation({
    mutationFn: () =>
      api.projects.create({
        title: form.title,
        description: form.description || undefined,
        tags: form.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
        visibility: form.visibility,
        links: links.length ? links : undefined,
      }),
    onSuccess: project => navigate(`/projects/${project.id}`),
  })

  if (!user) {
    return (
      <div className="contentMaxWidth" style={{ paddingTop: 32 }}>
        <EmptyState
          icon="mdi-account-lock-outline"
          title="You need to sign in to share a project."
          action={
            <Btn variant="accent" to="/session" style={{ marginTop: 16 }}>
              Sign in with UTORid
            </Btn>
          }
        />
      </div>
    )
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const addLink = () => {
    if (!form.linkLabel || !form.linkUrl) return
    setLinks(ls => [...ls, { label: form.linkLabel, url: form.linkUrl }])
    setForm(f => ({ ...f, linkLabel: '', linkUrl: '' }))
  }

  const tagPreview = form.tags
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 760 }}>
      <PageHeader title="Share a project" subtitle="It takes a minute. You can change any of this later." />

      <Card style={{ padding: 28, display: 'grid', gap: 20 }}>
        <Field label="Title *">
          <TextField value={form.title} onChange={set('title')} placeholder="Autonomous rover for AER201" />
        </Field>

        <Field label="Description">
          <TextArea
            rows={5}
            value={form.description}
            onChange={set('description')}
            placeholder="What did you build, and why? What was hard about it?"
          />
        </Field>

        <Field label="Tags" hint="Comma-separated. Course codes, topics, tools or faculty all work.">
          <TextField value={form.tags} onChange={set('tags')} placeholder="React, Machine Learning, CSC309" />
        </Field>
        {tagPreview.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -12 }}>
            {tagPreview.map(t => (
              <Chip key={t} small color="blue">
                {t}
              </Chip>
            ))}
          </div>
        )}

        <Field label="Visibility">
          <SelectField value={form.visibility} onChange={set('visibility')}>
            {VISIBILITY.map(v => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </SelectField>
        </Field>

        <Divider />

        <div>
          <span className="v-label">Links</span>
          {links.length > 0 && (
            <ul className="v-list" style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
              {links.map((l, i) => (
                <li
                  key={`${l.url}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--v-border-base)',
                  }}
                >
                  <Icon name="mdi-link-variant" size={18} color="var(--text-secondary)" />
                  <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{l.label}</span>
                  <span className="text--disabled overflow-ellipsis" style={{ fontSize: '0.8125rem', flex: 1 }}>
                    {l.url}
                  </span>
                  <Btn icon onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))} aria-label={`Remove ${l.label}`}>
                    <Icon name="mdi-close" size={18} />
                  </Btn>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <TextField value={form.linkLabel} onChange={set('linkLabel')} placeholder="Label (e.g. GitHub)" />
            </div>
            <div style={{ flex: '2 1 220px' }}>
              <TextField value={form.linkUrl} onChange={set('linkUrl')} placeholder="https://…" />
            </div>
            <Btn variant="outlined" onClick={addLink} disabled={!form.linkLabel || !form.linkUrl} style={{ height: 44 }}>
              Add
            </Btn>
          </div>
        </div>

        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Btn
            variant="accent"
            size="large"
            onClick={() => mutation.mutate()}
            disabled={!form.title.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create project'}
          </Btn>
          <Btn to="/projects">Cancel</Btn>
        </div>
      </Card>
    </div>
  )
}
