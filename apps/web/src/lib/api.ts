import type {
  Campus,
  User,
  Project,
  Comment,
  ProjectLink,
  Notification,
  OrgActivity,
  OrgStatus,
  ReportReason,
  ReportStatus,
  Visibility,
} from '@uofthub/types'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only set Content-Type: application/json when there's actually a JSON
  // body to send. FormData sets its own multipart boundary — forcing this
  // header would break the upload. And a bodyless call (logout, like,
  // follow, delete) sending this header anyway trips Fastify's default JSON
  // parser, which rejects an empty body under application/json with a 400.
  const isFormData = init?.body instanceof FormData
  const hasJsonBody = init?.body !== undefined && !isFormData
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: hasJsonBody ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    ...init,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(error.error ?? 'Request failed')
  }
  return res.json()
}

export type MeUser = User & { role: 'STUDENT' | 'FACULTY'; isAdmin: boolean }

export type ProjectFile = { id: string; name: string; sizeBytes: number; mimeType?: string; uploadedAt: string }

/**
 * What the viewer needs to show one file. Text arrives as a string — the
 * storage bucket has no CORS headers to fetch it with — while media arrives as
 * a short-lived signed URL the browser loads directly.
 */
export type FilePreview =
  | { kind: 'text'; name: string; text: string; truncated: boolean }
  | { kind: 'image' | 'pdf' | 'video' | 'audio'; name: string; url: string }

export type ProjectDetail = Project & {
  collaborators: { user: Pick<User, 'id' | 'name' | 'avatarUrl'>; accepted: boolean }[]
  files: ProjectFile[]
  links: ProjectLink[]
  _count: { likes: number; comments: number }
}

export type ProjectSummary = Project & {
  _count: { likes: number; comments: number }
  /**
   * Signed, short-lived URL for the project's first uploaded image, used as
   * the card thumbnail. Absent when the project has no image — the card draws
   * its own monogram instead.
   */
  coverUrl?: string
}

export type ProfileUser = {
  id: string
  name: string
  faculty?: string
  campus?: Campus
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

export type AccessRequest = {
  projectId: string
  userId: string
  role: 'VIEWER'
  accepted: boolean
  invitedAt: string
  user: Pick<User, 'id' | 'name' | 'email' | 'faculty'>
}

export type Org = {
  id: string
  slug: string
  name: string
  type: 'CLUB' | 'LAB'
  /** Absent means the group serves all three campuses, not that it is unknown. */
  campus?: Campus
  description?: string
  websiteUrl?: string
  discordUrl?: string
  groupMeUrl?: string
  status: OrgStatus
  /** Members only — everyone else gets these fields stripped by the API. */
  contactEmail?: string
  contactRole?: string
  verificationNote?: string
  reviewNote?: string
  verificationDeadline?: string
  verifiedAt?: string
  createdAt: string
  _count?: { members: number; projects: number }
}

/** `GET /orgs/:slug` — the group page's full payload. */
export type OrgDetail = Org & {
  members: {
    orgId: string
    userId: string
    role: string
    user: Pick<User, 'id' | 'name' | 'avatarUrl' | 'faculty'>
  }[]
  activities: OrgActivity[]
  projects: {
    orgId: string
    projectId: string
    project: Pick<Project, 'id' | 'title' | 'description'> & {
      owner: Pick<User, 'id' | 'name'>
      _count: { likes: number; comments: number }
    }
  }[]
  /** Members only. */
  storage?: OrgStorage
}

/** A group awaiting a decision, as the admin queue sees it. */
export type AdminOrg = Org & {
  members: { userId: string; role: string; user: Pick<User, 'id' | 'name' | 'email'> }[]
  _count: { members: number; projects: number; activities: number }
}

export type OrgDecision = 'APPROVE' | 'REQUEST_INFO' | 'DENY'

export type OrgStorage = { quotaBytes: number; usedBytes: number }

/** A report as the moderation queue sees it — reporter and project inlined. */
export type AdminReport = {
  id: string
  reason: ReportReason
  details?: string
  status: ReportStatus
  createdAt: string
  reviewedAt?: string
  reviewNote?: string
  reporter: Pick<User, 'id' | 'name' | 'email'>
  reviewedBy?: { id: string; name: string }
  project: {
    id: string
    title: string
    description?: string
    visibility: Visibility
    takenDownAt?: string
    owner: Pick<User, 'id' | 'name' | 'email'>
  }
}

export type ReportDecision = 'DISMISS' | 'WARN' | 'TAKE_DOWN'

/** What `/discover` understood the query to mean. Every field may be null. */
export type DiscoverFilters = {
  search: string | null
  faculty: string | null
  campus: Campus | null
  tag: string | null
  sort: 'new' | 'trending' | null
  within: 'month' | 'term' | 'year' | null
}

export const api = {
  auth: {
    me: () => request<MeUser>('/auth/me'),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    login: (body: { email: string; password: string }) =>
      request<{ id: string; email: string; name: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    register: (body: { name: string; email: string; password: string }) =>
      request<{ id: string; email: string; name: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  projects: {
    list: (params?: { search?: string; faculty?: string; campus?: string; sort?: string; skip?: number }) => {
      const q = new URLSearchParams()
      if (params?.search) q.set('search', params.search)
      if (params?.faculty) q.set('faculty', params.faculty)
      if (params?.campus) q.set('campus', params.campus)
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
    accessRequests: (id: string) => request<AccessRequest[]>(`/projects/${id}/access-requests`),
    approveAccessRequest: (id: string, userId: string) =>
      request<unknown>(`/projects/${id}/collaborators/${userId}`, { method: 'PATCH', body: JSON.stringify({ accepted: true }) }),
    // Same endpoint, answered by the invitee about themselves rather than by
    // the owner about a requester.
    respondToInvite: (id: string, myUserId: string, accepted: boolean) =>
      request<unknown>(`/projects/${id}/collaborators/${myUserId}`, { method: 'PATCH', body: JSON.stringify({ accepted }) }),
    removeCollaborator: (id: string, userId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/collaborators/${userId}`, { method: 'DELETE' }),
    uploadFile: (id: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<ProjectFile>(`/projects/${id}/files`, { method: 'POST', body: form })
    },
    deleteFile: (id: string, fileId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/files/${fileId}`, { method: 'DELETE' }),
    downloadUrl: (id: string, fileId: string) => `${API_URL}/projects/${id}/files/${fileId}/download`,
    filePreview: (id: string, fileId: string) =>
      request<FilePreview>(`/projects/${id}/files/${fileId}/preview`),
    report: (id: string, body: { reason: ReportReason; details?: string }) =>
      request<{ id: string; status: ReportStatus }>(`/projects/${id}/report`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  discover: {
    search: (q: string) =>
      request<{ filters: DiscoverFilters; interpreted: boolean; projects: ProjectSummary[] }>(
        `/discover?q=${encodeURIComponent(q)}`
      ),
  },
  admin: {
    reports: (status: ReportStatus | 'all' = 'OPEN') =>
      request<AdminReport[]>(`/admin/reports?status=${status}`),
    decide: (id: string, body: { decision: ReportDecision; note?: string }) =>
      request<AdminReport>(`/admin/reports/${id}/decision`, { method: 'POST', body: JSON.stringify(body) }),
    orgs: (status: OrgStatus | 'all' = 'IN_REVIEW') => request<AdminOrg[]>(`/admin/orgs?status=${status}`),
    decideOrg: (slug: string, body: { decision: OrgDecision; note?: string }) =>
      request<AdminOrg>(`/admin/orgs/${slug}/decision`, { method: 'POST', body: JSON.stringify(body) }),
  },
  orgs: {
    list: (params?: { campus?: string }) =>
      request<Org[]>(`/orgs${params?.campus ? `?campus=${params.campus}` : ''}`),
    get: (slug: string) => request<OrgDetail>(`/orgs/${slug}`),
    create: (body: {
      name: string
      slug: string
      type?: string
      campus?: string
      description?: string
      websiteUrl?: string
      discordUrl?: string
      groupMeUrl?: string
      contactEmail: string
      contactRole: string
    }) => request<Org>('/orgs', { method: 'POST', body: JSON.stringify(body) }),
    update: (
      slug: string,
      body: Partial<{ description: string; campus: string; websiteUrl: string; discordUrl: string; groupMeUrl: string }>
    ) =>
      request<Org>(`/orgs/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
    verify: (slug: string, note: string) =>
      request<Org>(`/orgs/${slug}/verify`, { method: 'POST', body: JSON.stringify({ note }) }),
    activities: (slug: string) => request<OrgActivity[]>(`/orgs/${slug}/activities`),
    addActivity: (
      slug: string,
      body: { title: string; description?: string; date?: string; link?: string; imageUrl?: string }
    ) => request<OrgActivity>(`/orgs/${slug}/activities`, { method: 'POST', body: JSON.stringify(body) }),
    deleteActivity: (slug: string, id: string) =>
      request<{ ok: boolean }>(`/orgs/${slug}/activities/${id}`, { method: 'DELETE' }),
    addProject: (slug: string, projectId: string) =>
      request<unknown>(`/orgs/${slug}/projects`, { method: 'POST', body: JSON.stringify({ projectId }) }),
    addMember: (slug: string, email: string) =>
      request<unknown>(`/orgs/${slug}/members`, { method: 'POST', body: JSON.stringify({ email }) }),
  },
  users: {
    get: (id: string) => request<ProfileUser>(`/users/${id}`),
    projects: (id: string, params?: { skip?: number }) =>
      request<ProjectSummary[]>(`/users/${id}/projects${params?.skip ? `?skip=${params.skip}` : ''}`),
    updateMe: (
      body: Partial<{
        name: string
        faculty: string
        // Empty string clears it back to unstated, which is why this is not Campus.
        campus: string
        program: string
        classYear: number
        bio: string
      }>
    ) =>
      request<MeUser>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
    follow: (id: string) => request<{ following: boolean }>(`/users/${id}/follow`, { method: 'POST' }),
    followingMe: (id: string) => request<{ following: boolean }>(`/users/${id}/follow/me`),
    uploadAvatar: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<MeUser>('/users/me/avatar', { method: 'POST', body: form })
    },
    deleteAvatar: () => request<{ ok: boolean }>('/users/me/avatar', { method: 'DELETE' }),
  },
  notifications: {
    list: () => request<{ notifications: Notification[]; unreadCount: number }>('/users/me/notifications'),
    markRead: (id: string) => request<{ ok: boolean }>(`/users/me/notifications/${id}/read`, { method: 'POST', body: '{}' }),
    markAllRead: () => request<{ ok: boolean }>('/users/me/notifications/read-all', { method: 'POST', body: '{}' }),
  },
}

/**
 * Guard for user-supplied links before they reach an `href`. React does not
 * sanitize href, so a stored `javascript:` URL would execute on click. The API
 * rejects these on write; this covers rows saved before that check existed.
 */
export function safeUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  try {
    const parsed = new URL(raw, window.location.origin)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}
