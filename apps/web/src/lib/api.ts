import type { User, Project, Comment, ProjectLink } from '@uofthub/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(error.error ?? 'Request failed')
  }
  return res.json()
}

export type MeUser = User & { role: 'STUDENT' | 'FACULTY' }

export type ProjectDetail = Project & {
  collaborators: { user: Pick<User, 'id' | 'name' | 'avatarUrl'>; accepted: boolean }[]
  files: { id: string; name: string; url: string; sizeBytes: number; mimeType?: string }[]
  links: ProjectLink[]
  _count: { likes: number; comments: number }
}

export type ProjectSummary = Project & {
  _count: { likes: number; comments: number }
}

export type ProfileUser = {
  id: string
  name: string
  faculty?: string
  program?: string
  classYear?: number
  bio?: string
  avatarUrl?: string
  createdAt: string
  _count: { ownedProjects: number; followers: number; following: number }
}

export type ProjectVersion = {
  id: string
  projectId: string
  versionNum: number
  title: string
  description?: string
  tags: string[]
  createdAt: string
}

export type Analytics = {
  totalViews: number
  likes: number
  comments: number
  forks: number
  dailyViews: { date: string; count: number }[]
}

export type Org = {
  id: string
  slug: string
  name: string
  type: 'CLUB' | 'LAB'
  description?: string
  websiteUrl?: string
  createdAt: string
  _count?: { members: number; projects: number }
}

export const api = {
  auth: {
    me: () => request<MeUser>('/auth/me'),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  },
  projects: {
    list: (params?: { search?: string; faculty?: string; sort?: string; skip?: number }) => {
      const q = new URLSearchParams()
      if (params?.search) q.set('search', params.search)
      if (params?.faculty) q.set('faculty', params.faculty)
      if (params?.sort) q.set('sort', params.sort)
      if (params?.skip) q.set('skip', String(params.skip))
      return request<ProjectSummary[]>(`/projects?${q}`)
    },
    get: (id: string) => request<ProjectDetail>(`/projects/${id}`),
    create: (body: { title: string; description?: string; tags?: string[]; visibility?: string; links?: { label: string; url: string }[] }) =>
      request<ProjectDetail>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<{ title: string; description: string; tags: string[]; visibility: string }>) =>
      request<ProjectDetail>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
    like: (id: string) => request<{ liked: boolean }>(`/projects/${id}/like`, { method: 'POST' }),
    likedByMe: (id: string) => request<{ liked: boolean }>(`/projects/${id}/likes/me`),
    comments: (id: string) => request<Comment[]>(`/projects/${id}/comments`),
    addComment: (id: string, body: string) =>
      request<Comment>(`/projects/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    addLink: (id: string, link: { label: string; url: string }) =>
      request<ProjectLink>(`/projects/${id}/links`, { method: 'POST', body: JSON.stringify(link) }),
    deleteLink: (id: string, linkId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/links/${linkId}`, { method: 'DELETE' }),
    inviteCollaborator: (id: string, email: string) =>
      request<unknown>(`/projects/${id}/collaborators`, { method: 'POST', body: JSON.stringify({ email }) }),
    versions: (id: string) => request<ProjectVersion[]>(`/projects/${id}/versions`),
    createVersion: (id: string) => request<ProjectVersion>(`/projects/${id}/versions`, { method: 'POST', body: '{}' }),
    fork: (id: string) => request<ProjectDetail>(`/projects/${id}/fork`, { method: 'POST', body: '{}' }),
    analytics: (id: string) => request<Analytics>(`/projects/${id}/analytics`),
    requestAccess: (id: string) => request<{ ok: boolean }>(`/projects/${id}/request-access`, { method: 'POST', body: '{}' }),
    accessRequests: (id: string) => request<unknown[]>(`/projects/${id}/access-requests`),
  },
  discover: {
    search: (q: string) => request<{ params: Record<string, string>; projects: ProjectSummary[] }>(`/discover?q=${encodeURIComponent(q)}`),
  },
  orgs: {
    list: () => request<Org[]>('/orgs'),
    get: (slug: string) => request<Org & { members: unknown[]; projects: unknown[] }>(`/orgs/${slug}`),
    create: (body: { name: string; slug: string; type?: string; description?: string; websiteUrl?: string }) =>
      request<Org>('/orgs', { method: 'POST', body: JSON.stringify(body) }),
    addProject: (slug: string, projectId: string) =>
      request<unknown>(`/orgs/${slug}/projects`, { method: 'POST', body: JSON.stringify({ projectId }) }),
    addMember: (slug: string, email: string) =>
      request<unknown>(`/orgs/${slug}/members`, { method: 'POST', body: JSON.stringify({ email }) }),
  },
  users: {
    get: (id: string) => request<ProfileUser>(`/users/${id}`),
    projects: (id: string) => request<ProjectSummary[]>(`/users/${id}/projects`),
    updateMe: (body: Partial<{ name: string; faculty: string; program: string; classYear: number; bio: string }>) =>
      request<MeUser>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
    follow: (id: string) => request<{ following: boolean }>(`/users/${id}/follow`, { method: 'POST' }),
    followingMe: (id: string) => request<{ following: boolean }>(`/users/${id}/follow/me`),
  },
}
