import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

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
        <p className="text-gray-500 mb-4">You need to sign in to share a project.</p>
        <Link to="/" className="text-blue-700 hover:underline">← Back to home</Link>
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Share a project</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></span>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="My awesome project"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Description</span>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What did you build, and why?"
            rows={4}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Tags</span>
          <input
            value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder="React, Machine Learning, CSC309, …"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <p className="text-xs text-gray-400 mt-1">Comma-separated. Include course codes, topics, or faculty.</p>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Visibility</span>
          <select
            value={form.visibility}
            onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          >
            <option value="PRIVATE">Private — only you</option>
            <option value="UOFT">U of T only — signed-in U of T students</option>
            <option value="PUBLIC">Public — anyone</option>
          </select>
        </label>

        {/* Links */}
        <div>
          <span className="text-sm font-medium text-gray-700">Links</span>
          {links.length > 0 && (
            <ul className="mt-2 space-y-1">
              {links.map((l, i) => (
                <li key={i} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                  <span>{l.label} — <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{l.url}</a></span>
                  <button onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-2">×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <input
              value={form.linkLabel}
              onChange={e => setForm(f => ({ ...f, linkLabel: e.target.value }))}
              placeholder="Label (e.g. GitHub)"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <input
              value={form.linkUrl}
              onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))}
              placeholder="https://…"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={addLink}
              disabled={!form.linkLabel || !form.linkUrl}
              className="text-sm border border-gray-300 px-3 py-2 rounded-md hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-red-500 text-sm">{(mutation.error as Error).message}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.title.trim() || mutation.isPending}
            className="bg-blue-900 text-white text-sm px-6 py-2.5 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors font-medium"
          >
            {mutation.isPending ? 'Creating…' : 'Create project'}
          </button>
          <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2.5">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
