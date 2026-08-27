import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

const surface = { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }

const inputBase: React.CSSProperties = {
  display: 'block',
  width: '100%',
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  color: '#fff',
  borderRadius: '0.5rem',
  padding: '8px 12px',
  fontSize: '0.875rem',
  outline: 'none',
  marginTop: '4px',
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#aaa]">
        {label} {required && <span style={{ color: 'var(--color-error)' }}>*</span>}
      </span>
      {children}
    </label>
  )
}

export default function CreateProjectPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
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
    mutationFn: () => api.projects.create({
      title: form.title,
      description: form.description || undefined,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      visibility: form.visibility,
      links: links.length ? links : undefined,
    }),
    onSuccess: (project) => navigate(`/projects/${project.id}`),
  })

  if (!user) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-[#666] mb-4">You need to sign in to share a project.</p>
        <Link to="/" className="hover:underline" style={{ color: 'var(--color-primary)' }}>← Back to home</Link>
      </div>
    )
  }

  const addLink = () => {
    if (!form.linkLabel || !form.linkUrl) return
    setLinks(ls => [...ls, { label: form.linkLabel, url: form.linkUrl }])
    setForm(f => ({ ...f, linkLabel: '', linkUrl: '' }))
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-medium text-white mb-6">Share a project</h1>

      <div className="rounded-xl p-6 space-y-4" style={surface}>
        <Field label="Title" required>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="My awesome project" style={inputBase} />
        </Field>

        <Field label="Description">
          <textarea value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What did you build, and why?" rows={4}
            style={{ ...inputBase, resize: 'none' }} />
        </Field>

        <Field label="Tags">
          <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder="React, Machine Learning, CSC309, …" style={inputBase} />
          <p className="text-xs text-[#555] mt-1">Comma-separated. Include course codes, topics, or faculty.</p>
        </Field>

        <Field label="Visibility">
          <select value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
            style={{ ...inputBase, cursor: 'pointer' }}>
            <option value="PRIVATE">Private — only you</option>
            <option value="UOFT">U of T only — signed-in U of T students</option>
            <option value="PUBLIC">Public — anyone</option>
          </select>
        </Field>

        {/* Links */}
        <div>
          <span className="text-sm font-medium text-[#aaa]">Links</span>
          {links.length > 0 && (
            <ul className="mt-2 space-y-1">
              {links.map((l, i) => (
                <li key={i} className="flex items-center justify-between text-sm rounded-lg px-3 py-2"
                  style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <span className="text-[#aaa]">
                    {l.label} —{' '}
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--color-primary)' }}>{l.url}</a>
                  </span>
                  <button onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))}
                    className="text-[#555] hover:text-red-400 ml-2 cursor-pointer transition-colors">×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <input value={form.linkLabel} onChange={e => setForm(f => ({ ...f, linkLabel: e.target.value }))}
              placeholder="Label (e.g. GitHub)" style={{ ...inputBase, marginTop: 0 }} />
            <input value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))}
              placeholder="https://…" style={{ ...inputBase, marginTop: 0 }} />
            <button onClick={addLink} disabled={!form.linkLabel || !form.linkUrl}
              className="text-sm px-3 py-2 rounded-lg disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap text-[#aaa] hover:text-white"
              style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}>
              Add
            </button>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-red-400 text-sm">{(mutation.error as Error).message}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={() => mutation.mutate()} disabled={!form.title.trim() || mutation.isPending}
            className="text-sm px-6 py-2.5 rounded-lg disabled:opacity-40 cursor-pointer transition-colors font-medium"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
            {mutation.isPending ? 'Creating…' : 'Create project'}
          </button>
          <Link to="/" className="text-sm text-[#666] hover:text-[#aaa] no-underline px-4 py-2.5 transition-colors">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
