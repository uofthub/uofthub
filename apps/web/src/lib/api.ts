import type {
  Campus,
  CommentThread,
  User,
  Project,
  ProjectDetailItem,
  ProjectLink,
  ProjectOutput,
  ProjectReference,
  ProjectSection,
  ProjectStatus,
  ProjectType,
  Notification,
  OrgActivity,
  OrgStatus,
  ReactionKind,
  ReportReason,
  ReportStatus,
  Visibility,
} from '@uofthub/types'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only set Content-Type: application/json when there's actually a JSON
  // body to send. FormData sets its own multipart boundary — forcing this
  // header would break the upload. And a bodyless call (logout, follow,
  // delete) sending this header anyway trips Fastify's default JSON parser,
  // which rejects an empty body under application/json with a 400.
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

const post = (body: unknown = {}): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export type MeUser = User & { role: 'STUDENT' | 'FACULTY'; isAdmin: boolean }

export type ProjectFile = {
  id: string
  name: string
  sizeBytes: number
  mimeType?: string
  uploadedAt: string
}

/**
 * What the viewer needs to show one file. Text arrives as a string — the
 * storage bucket has no CORS headers to fetch it with — while media arrives as
 * a short-lived signed URL the browser loads directly.
 */
export type FilePreview =
  | { kind: 'text'; name: string; text: string; truncated: boolean }
  | { kind: 'image' | 'pdf' | 'video' | 'audio'; name: string; url: string }

/**
 * A project as every list returns it — everything a card draws, so no card
 * makes a request of its own (see apps/api/src/lib/projectShape.ts).
 */
export type ProjectSummary = Project & {
  links: ProjectLink[]
  /** Accepted collaborators only. */
  collaborators: { user: Pick<User, 'id' | 'name' | 'avatarUrl'> }[]
  _count: { comments: number }
  /**
   * Signed, short-lived URL for the project's first uploaded image, used as
   * the card cover. Absent when the project has no image — the card draws its
   * own cover instead.
   */
  coverUrl?: string
  reactions: Record<ReactionKind, number>
  reactionTotal: number
  /** The caller's own reactions. */
  myReactions: ReactionKind[]
  /** Whether the caller has saved it. Always false signed out. */
  saved: boolean
  /** The verified groups it was built with — "Built with UofT Robotics". */
  orgProjects: { org: OrgRef }[]
}

export type OrgRef = { slug: string; name: string; type: 'CLUB' | 'LAB' }

export type ProjectDetail = Omit<ProjectSummary, 'collaborators'> & {
  collaborators: {
    user: Pick<User, 'id' | 'name' | 'avatarUrl' | 'faculty' | 'campus'>
    accepted: boolean
  }[]
  files: ProjectFile[]
  references: ProjectReference[]
  outputs: ProjectOutput[]
  /** Whether the caller follows this project's updates. */
  following?: boolean
  /** Owner only: how many people follow it. */
  followerCount?: number
}

/** One of a project's references, and other projects that cited the same thing. */
export type SharedReference = {
  reference: Pick<ProjectReference, 'id' | 'key' | 'title' | 'kind'>
  projects: ProjectSummary[]
}

/** One output as the editor saves it: a file, an existing link, or a new link. */
export type OutputInput = {
  id?: string
  kind: ProjectOutput['kind']
  label?: string | null
  primary?: boolean
} & ({ fileId: string } | { linkId: string } | { link: { label: string; url: string } })

/** The fields a project form writes. `null` clears a field. */
export type ProjectFields = {
  title: string
  pitch: string | null
  description: string
  type: ProjectType | null
  status: ProjectStatus | null
  tags: string[]
  visibility: Visibility
  sections: ProjectSection[] | null
  details: ProjectDetailItem[] | null
  /** Replaced as a whole list. */
  references: Omit<ProjectReference, 'id' | 'key'>[] | null
  /** Replaced as a whole list; `id` keeps an existing output and its thumbnail. */
  outputs: OutputInput[] | null
  /** A calendar day (`2026-12-20`), read as midnight in Toronto. */
  showFrom: string | null
  courseCode: string | null
  /** The course template the project was started from, and its version. */
  templateCode: string | null
  templateVersion: number | null
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
  openTo?: string[]
  websiteUrl?: string | null
  githubUrl?: string | null
  linkedinUrl?: string | null
  courses?: string[]
  allowMessages?: boolean
  createdAt: string
  _count: { ownedProjects: number; followers: number; following: number; collaborations: number }
}

/** A collection as a list shows it: a few covers and how many projects this reader can see. */
export type CollectionSummary = {
  id: string
  title: string
  description?: string | null
  owner: Pick<User, 'id' | 'name' | 'avatarUrl' | 'campus'>
  createdAt: string
  updatedAt: string
  projectCount: number
  preview: Pick<ProjectSummary, 'id' | 'title' | 'type' | 'coverUrl'>[]
}

export type CollectionDetail = Omit<CollectionSummary, 'preview'> & { projects: ProjectSummary[] }

/** One of the caller's collections, for the "Add to collection" menu. */
export type MyCollection = { id: string; title: string; projectCount: number; hasProject: boolean }

export type ChatPerson = Pick<User, 'id' | 'name' | 'avatarUrl' | 'faculty' | 'campus'>

export type Conversation = {
  user: ChatPerson
  lastMessage: { id: string; body: string; fromMe: boolean; createdAt: string }
  unread: number
  /** You blocked them — the conversation stays listed, closed. */
  blocked: boolean
}

export type Message = {
  id: string
  senderId: string
  body: string
  fromMe: boolean
  createdAt: string
  readAt?: string | null
}

/**
 * Why you can't send in a conversation: `suspended` by a moderator, `blocked`
 * by you, or `unavailable` — they blocked you or don't take new messages, and
 * the API deliberately doesn't say which.
 */
export type ThreadClosed = 'suspended' | 'blocked' | 'unavailable'

export type Thread = {
  user: ChatPerson
  canMessage: boolean
  closed: ThreadClosed | null
  /** They have written to you, so there is something to report. */
  canReport: boolean
  /** You have an open report about this conversation. */
  reported: boolean
  hasMore: boolean
  messages: Message[]
}

/** What "Start from a link" fills the post form with. */
export type ImportedLink = {
  url: string
  title?: string
  pitch?: string
  description?: string
  type?: ProjectType
  tags: string[]
  links: { label: string; url: string }[]
  image?: { name: string; contentType: string; dataBase64: string }
}

export type ProjectVersion = {
  id: string
  projectId: string
  versionNum: number
  /** What changed — the line the Updates timeline shows. */
  note?: string | null
  title: string
  description?: string
  tags: string[]
  createdAt: string
}

type Person = Pick<User, 'id' | 'name' | 'avatarUrl'> & { faculty?: string }

/** GET /projects/:id/analytics — the owner's own numbers. */
export type Analytics = {
  /** Unique viewers per day, summed. */
  totalViews: number
  comments: number
  forks: number
  /** How many people saved it — never who. */
  saves: number
  /** How many people follow its updates. */
  followers: number
  /** Two adjacent weeks, so "quiet" reads differently from "slowing down". */
  viewsThisWeek: number
  viewsLastWeek: number
  reactions: Record<ReactionKind, number>
  /** Who wants to collaborate — the one list only the owner sees. */
  collabInterest: { user: Person; createdAt: string }[]
  recentReactions: { user: Person; kind: ReactionKind; createdAt: string }[]
  dailyViews: { date: string; count: number }[]
}

/** Why one project reached this student's feed. See routes/feed.ts. */
export type FeedReason =
  | { kind: 'FOLLOWING'; userId: string; userName: string }
  | { kind: 'COURSE'; tag: string }
  | { kind: 'CAMPUS'; campus: Campus }
  | { kind: 'TRENDING' }

export type FeedItem = { project: ProjectSummary; reason: FeedReason }

/** The feed's tabs. `all` is the blended feed. */
export type FeedScope = 'all' | 'following' | 'campus' | 'program'

/** A week of engagement on the student's own work. */
export type FeedActivity = {
  projectCount: number
  views: number
  previousViews: number
  comments: number
  reactions: number
  /** Of this week's reactions, how many were offers to collaborate. */
  collabRequests: number
  recentComments: {
    id: string
    body: string
    createdAt: string
    user: Pick<User, 'id' | 'name' | 'avatarUrl'>
    project: { id: string; title: string }
  }[]
  recentReactions: {
    kind: ReactionKind
    createdAt: string
    user: Pick<User, 'id' | 'name' | 'avatarUrl'>
    project: { id: string; title: string }
  }[]
}

/** GET /projects/facets — the counts Explore and the rails show. */
export type Facets = {
  faculties: Record<string, number>
  courses: { code: string; count: number }[]
  tagsThisWeek: { tag: string; count: number; course: boolean }[]
  types: Partial<Record<ProjectType, number>>
  helpWanted: number
}

/** GET /spotlight — a moderator's pick, or this week's most active project. */
export type Spotlight = {
  curated: boolean
  note: string | null
  weekOf: string
  project: ProjectSummary | null
}

export type UpcomingEvent = OrgActivity & { org: { slug: string; name: string; campus?: Campus } }

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
    project: Pick<Project, 'id' | 'title' | 'pitch' | 'description'> & {
      owner: Pick<User, 'id' | 'name'>
      _count: { comments: number; reactions: number }
    }
  }[]
}

/** A group awaiting a decision, as the admin queue sees it. */
export type AdminOrg = Org & {
  members: { userId: string; role: string; user: Pick<User, 'id' | 'name' | 'email'> }[]
  _count: { members: number; projects: number; activities: number }
}

/** For a group left over from the old self-serve verification flow. */
export type OrgDecision = 'APPROVE' | 'DENY'

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

/** A reported conversation, with the thread as it was when it was reported. */
export type AdminMessageReport = {
  id: string
  reason: ReportReason
  details?: string
  status: ReportStatus
  createdAt: string
  reviewedAt?: string
  reviewNote?: string
  messages: { senderId: string; body: string; createdAt: string }[]
  reporter: Pick<User, 'id' | 'name' | 'email'>
  reported: Pick<User, 'id' | 'name' | 'email'> & { messagingSuspendedAt: string | null }
  reviewedBy?: { id: string; name: string }
}

/** SUSPEND stops the sender messaging anyone; it is recorded as TAKEN_DOWN. */
export type MessageReportDecision = 'DISMISS' | 'WARN' | 'SUSPEND'

/** A week's spotlight pick, as the moderation page lists them. */
export type AdminSpotlight = {
  id: string
  projectId: string
  weekOf: string
  note?: string | null
  createdAt: string
  project: {
    id: string
    title: string
    visibility: Visibility
    owner: { id: string; name: string }
  }
  pickedBy?: { id: string; name: string } | null
}

/** What `/discover` understood the query to mean. Every field may be null. */
export type DiscoverFilters = {
  search: string | null
  faculty: string | null
  campus: Campus | null
  tag: string | null
  sort: 'new' | 'trending' | null
  within: 'month' | 'term' | 'year' | null
}

const paged = (path: string, skip?: number) => (skip ? `${path}?skip=${skip}` : path)

export const api = {
  auth: {
    me: () => request<MeUser>('/auth/me'),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    login: (body: { email: string; password: string }) =>
      request<{ id: string; email: string; name: string }>('/auth/login', post(body)),
    register: (body: { name: string; email: string; password: string }) =>
      request<{ id: string; email: string; name: string }>('/auth/register', post(body)),
  },
  projects: {
    list: (params?: {
      search?: string
      /** A full code (CSC211H5) or a stem (CSC211, every campus of it). */
      course?: string
      faculty?: string
      campus?: string
      type?: ProjectType
      status?: ProjectStatus
      sort?: 'new' | 'trending'
      skip?: number
      /** Page size; the API defaults to 20 and caps at 50. */
      take?: number
    }) => {
      const q = new URLSearchParams()
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined && value !== '' && value !== 0) q.set(key, String(value))
      }
      return request<ProjectSummary[]>(`/projects?${q}`)
    },
    facets: () => request<Facets>('/projects/facets'),
    get: (id: string) => request<ProjectDetail>(`/projects/${id}`),
    sharedReferences: (id: string) =>
      request<SharedReference[]>(`/projects/${id}/shared-references`),
    create: (
      body: Partial<ProjectFields> & { title: string; links?: { label: string; url: string }[] }
    ) => request<ProjectSummary>('/projects', post(body)),
    update: (id: string, body: Partial<ProjectFields>) =>
      request<ProjectSummary>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
    save: (id: string) => request<{ saved: boolean }>(`/projects/${id}/save`, post()),
    followUpdates: (id: string) =>
      request<{ following: boolean }>(`/projects/${id}/follow`, post()),
    importLink: (url: string) => request<ImportedLink>('/projects/import', post({ url })),
    pin: (id: string) => request<{ pinned: boolean }>(`/projects/${id}/pin`, post()),
    react: (id: string, kind: ReactionKind) =>
      request<{ kind: ReactionKind; reacted: boolean }>(
        `/projects/${id}/reactions`,
        post({ kind })
      ),
    comments: (id: string) => request<CommentThread[]>(`/projects/${id}/comments`),
    addComment: (id: string, body: string, parentId?: string) =>
      request<CommentThread>(`/projects/${id}/comments`, post({ body, parentId })),
    helpful: (id: string, commentId: string) =>
      request<{ helpful: boolean; helpfulCount: number }>(
        `/projects/${id}/comments/${commentId}/helpful`,
        post()
      ),
    addLink: (id: string, link: { label: string; url: string }) =>
      request<ProjectLink>(`/projects/${id}/links`, post(link)),
    deleteLink: (id: string, linkId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/links/${linkId}`, { method: 'DELETE' }),
    inviteCollaborator: (id: string, email: string) =>
      request<unknown>(`/projects/${id}/collaborators`, post({ email })),
    versions: (id: string) => request<ProjectVersion[]>(`/projects/${id}/versions`),
    /** A snapshot; with a note it is also an update on the project's timeline. */
    createVersion: (id: string, note?: string) =>
      request<ProjectVersion>(`/projects/${id}/versions`, post({ note })),
    fork: (id: string) => request<ProjectSummary>(`/projects/${id}/fork`, post()),
    analytics: (id: string) => request<Analytics>(`/projects/${id}/analytics`),
    requestAccess: (id: string) =>
      request<{ ok: boolean }>(`/projects/${id}/request-access`, post()),
    accessRequests: (id: string) => request<AccessRequest[]>(`/projects/${id}/access-requests`),
    approveAccessRequest: (id: string, userId: string) =>
      request<unknown>(`/projects/${id}/collaborators/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ accepted: true }),
      }),
    // Same endpoint, answered by the invitee about themselves rather than by
    // the owner about a requester.
    respondToInvite: (id: string, myUserId: string, accepted: boolean) =>
      request<unknown>(`/projects/${id}/collaborators/${myUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({ accepted }),
      }),
    removeCollaborator: (id: string, userId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/collaborators/${userId}`, { method: 'DELETE' }),
    uploadFile: (id: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<ProjectFile>(`/projects/${id}/files`, { method: 'POST', body: form })
    },
    uploadThumbnail: (id: string, outputId: string, image: Blob) => {
      const form = new FormData()
      const ext = image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg'
      form.append('file', image, `thumbnail.${ext}`)
      return request<{ thumbnailUrl: string }>(`/projects/${id}/outputs/${outputId}/thumbnail`, {
        method: 'PUT',
        body: form,
      })
    },
    deleteThumbnail: (id: string, outputId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/outputs/${outputId}/thumbnail`, {
        method: 'DELETE',
      }),
    deleteFile: (id: string, fileId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/files/${fileId}`, { method: 'DELETE' }),
    downloadUrl: (id: string, fileId: string) =>
      `${API_URL}/projects/${id}/files/${fileId}/download`,
    filePreview: (id: string, fileId: string) =>
      request<FilePreview>(`/projects/${id}/files/${fileId}/preview`),
    report: (id: string, body: { reason: ReportReason; details?: string }) =>
      request<{ id: string; status: ReportStatus }>(`/projects/${id}/report`, post(body)),
  },
  feed: {
    list: (params?: { skip?: number; scope?: FeedScope; campus?: string; type?: ProjectType }) => {
      const q = new URLSearchParams()
      if (params?.skip) q.set('skip', String(params.skip))
      if (params?.scope && params.scope !== 'all') q.set('scope', params.scope)
      if (params?.campus) q.set('campus', params.campus)
      if (params?.type) q.set('type', params.type)
      return request<{ items: FeedItem[] }>(`/feed?${q}`)
    },
    activity: () => request<FeedActivity>('/feed/activity'),
  },
  spotlight: {
    current: () => request<Spotlight>('/spotlight'),
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
      request<AdminReport>(`/admin/reports/${id}/decision`, post(body)),
    messageReports: (status: ReportStatus | 'all' = 'OPEN') =>
      request<AdminMessageReport[]>(`/admin/message-reports?status=${status}`),
    decideMessageReport: (id: string, body: { decision: MessageReportDecision; note?: string }) =>
      request<AdminMessageReport>(`/admin/message-reports/${id}/decision`, post(body)),
    liftMessagingSuspension: (userId: string) =>
      request<{ ok: boolean }>(`/admin/users/${userId}/messaging-suspension`, {
        method: 'DELETE',
      }),
    orgs: (status: OrgStatus | 'all' = 'IN_REVIEW') =>
      request<AdminOrg[]>(`/admin/orgs?status=${status}`),
    decideOrg: (slug: string, body: { decision: OrgDecision; note?: string }) =>
      request<AdminOrg>(`/admin/orgs/${slug}/decision`, post(body)),
    spotlights: () => request<AdminSpotlight[]>('/admin/spotlight'),
    pickSpotlight: (body: { projectId: string; note?: string; weekOf?: string }) =>
      request<AdminSpotlight>('/admin/spotlight', post(body)),
    clearSpotlight: (weekOf: string) =>
      request<{ ok: boolean }>(`/admin/spotlight/${encodeURIComponent(weekOf)}`, {
        method: 'DELETE',
      }),
  },
  orgs: {
    upcoming: (take = 3) => request<UpcomingEvent[]>(`/orgs/events/upcoming?take=${take}`),
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
      contactEmail?: string
      contactRole?: string
      /** Moderators only: the exec's email; they become the group's admin. */
      execEmail?: string
    }) => request<Org>('/orgs', post(body)),
    update: (
      slug: string,
      body: Partial<{
        description: string
        campus: string
        websiteUrl: string
        discordUrl: string
        groupMeUrl: string
      }>
    ) => request<Org>(`/orgs/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
    activities: (slug: string) => request<OrgActivity[]>(`/orgs/${slug}/activities`),
    addActivity: (
      slug: string,
      body: { title: string; description?: string; date?: string; link?: string; imageUrl?: string }
    ) => request<OrgActivity>(`/orgs/${slug}/activities`, post(body)),
    deleteActivity: (slug: string, id: string) =>
      request<{ ok: boolean }>(`/orgs/${slug}/activities/${id}`, { method: 'DELETE' }),
    addProject: (slug: string, projectId: string) =>
      request<unknown>(`/orgs/${slug}/projects`, post({ projectId })),
    removeProject: (slug: string, projectId: string) =>
      request<{ ok: boolean }>(`/orgs/${slug}/projects/${projectId}`, { method: 'DELETE' }),
    addMember: (slug: string, email: string) =>
      request<unknown>(`/orgs/${slug}/members`, post({ email })),
  },
  users: {
    get: (id: string) => request<ProfileUser>(`/users/${id}`),
    projects: (id: string, params?: { skip?: number }) =>
      request<ProjectSummary[]>(paged(`/users/${id}/projects`, params?.skip)),
    pinned: (id: string) => request<ProjectSummary[]>(`/users/${id}/pinned`),
    /** Projects this person is credited on without owning. */
    collaborations: (id: string, params?: { skip?: number }) =>
      request<ProjectSummary[]>(paged(`/users/${id}/collaborations`, params?.skip)),
    /** Verified groups the caller belongs to — what a project can be linked to. */
    myOrgs: () => request<(OrgRef & { id: string })[]>('/users/me/orgs'),
    /** The caller's own saved projects. */
    saved: (params?: { skip?: number }) =>
      request<ProjectSummary[]>(paged('/users/me/saved', params?.skip)),
    updateMe: (
      body: Partial<{
        name: string
        // Empty string clears it, which is why these are not narrower types.
        faculty: string
        campus: string
        program: string
        classYear: number
        bio: string
        openTo: string[]
        websiteUrl: string | null
        githubUrl: string | null
        linkedinUrl: string | null
        courses: string[]
        allowMessages: boolean
      }>
    ) => request<MeUser>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
    follow: (id: string) =>
      request<{ following: boolean }>(`/users/${id}/follow`, { method: 'POST' }),
    followingMe: (id: string) => request<{ following: boolean }>(`/users/${id}/follow/me`),
    uploadAvatar: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<MeUser>('/users/me/avatar', { method: 'POST', body: form })
    },
    deleteAvatar: () => request<{ ok: boolean }>('/users/me/avatar', { method: 'DELETE' }),
  },
  collections: {
    list: (params?: { owner?: string; take?: number; skip?: number }) => {
      const q = new URLSearchParams()
      if (params?.owner) q.set('owner', params.owner)
      if (params?.take) q.set('take', String(params.take))
      if (params?.skip) q.set('skip', String(params.skip))
      const qs = q.toString()
      return request<CollectionSummary[]>(`/collections${qs ? `?${qs}` : ''}`)
    },
    get: (id: string) => request<CollectionDetail>(`/collections/${id}`),
    mine: (projectId?: string) =>
      request<MyCollection[]>(
        `/collections/mine${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
      ),
    create: (body: { title: string; description?: string; projectId?: string }) =>
      request<CollectionSummary>('/collections', post(body)),
    update: (id: string, body: { title?: string; description?: string | null }) =>
      request<CollectionSummary>(`/collections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) => request<{ ok: boolean }>(`/collections/${id}`, { method: 'DELETE' }),
    add: (id: string, projectId: string) =>
      request<{ ok: boolean }>(`/collections/${id}/items`, post({ projectId })),
    remove: (id: string, projectId: string) =>
      request<{ ok: boolean }>(`/collections/${id}/items/${projectId}`, { method: 'DELETE' }),
  },
  messages: {
    conversations: () => request<Conversation[]>('/messages'),
    unread: () => request<{ count: number }>('/messages/unread'),
    thread: (userId: string, before?: string) =>
      request<Thread>(
        `/messages/${userId}${before ? `?before=${encodeURIComponent(before)}` : ''}`
      ),
    send: (userId: string, body: string) => request<Message>(`/messages/${userId}`, post({ body })),
    block: (userId: string) => request<{ blocked: boolean }>(`/messages/${userId}/block`, post()),
    unblock: (userId: string) =>
      request<{ blocked: boolean }>(`/messages/${userId}/block`, { method: 'DELETE' }),
    report: (userId: string, body: { reason: ReportReason; details?: string; block: boolean }) =>
      request<{ id: string; status: ReportStatus }>(`/messages/${userId}/report`, post(body)),
  },
  notifications: {
    list: () =>
      request<{ notifications: Notification[]; unreadCount: number }>('/users/me/notifications'),
    markRead: (id: string) =>
      request<{ ok: boolean }>(`/users/me/notifications/${id}/read`, post()),
    markAllRead: () => request<{ ok: boolean }>('/users/me/notifications/read-all', post()),
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
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}
