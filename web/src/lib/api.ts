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
    throw new ApiError(error.error ?? 'Request failed', res.status, error.code)
  }
  return res.json()
}

/**
 * A refused request: the API's message, plus the status and the machine code
 * (`UNVERIFIED`, `SUSPENDED`) for the few places that answer them differently.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Whether a failed query was a 404, as opposed to the network or the server failing. */
export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404

const post = (body: unknown = {}): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

type ReportBody = { reason: ReportReason; details?: string }

export type MeUser = User & {
  role: 'STUDENT' | 'FACULTY'
  isAdmin: boolean
  /** False for an account that only signs in with Microsoft. */
  hasPassword: boolean
  emailNotifications: boolean
  /** Set while a moderator has suspended the account. */
  suspendedAt: string | null
}

type CheckEmail = { checkEmail: true }
type SignedIn = { id: string; email: string; name: string }

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
 * makes a request of its own (see api/src/lib/projectShape.ts).
 */
export type ProjectSummary = Project & {
  links: ProjectLink[]
  /** Accepted collaborators only. */
  collaborators: { title?: string | null; user: Pick<User, 'id' | 'name' | 'avatarUrl'> }[]
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
  /**
   * The output it leads with, by which file or link it is — what a card's
   * main button opens. Absent when it has none.
   */
  lead?: Pick<ProjectOutput, 'kind' | 'label'> & { fileId: string | null; linkId: string | null }
}

export type OrgRef = { slug: string; name: string; type: 'CLUB' | 'LAB' }

export type ProjectDetail = Omit<ProjectSummary, 'collaborators'> & {
  collaborators: {
    user: Pick<User, 'id' | 'name' | 'avatarUrl' | 'faculty' | 'campus'>
    accepted: boolean
    title?: string | null
  }[]
  files: ProjectFile[]
  references: ProjectReference[]
  outputs: ProjectOutput[]
  /** Whether the caller follows this project's updates. */
  following?: boolean
  /** Owner only: how many people follow it. */
  followerCount?: number
  /** Whether the caller may edit its content: its owner, or a collaborator. */
  canEdit: boolean
}

/**
 * What a course suggests its projects show — pre-fills the editor, and
 * nothing more. See api/src/lib/courseTemplates.ts.
 */
export type CourseTemplate = {
  code: string
  version: number
  type: ProjectType
  intro: string
  primaryOutput: { kind: ProjectOutput['kind']; prompt: string; accept?: string }
  sections: {
    kind: ProjectSection['kind']
    title?: string
    prompt: string
    items?: { label: string; prompt?: string }[]
  }[]
  references?: { kinds: ProjectReference['kind'][]; prompt: string }
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

/** What creating or saving a project returns: the card, plus its content. */
export type ProjectSaved = ProjectSummary &
  Pick<ProjectDetail, 'sections' | 'details' | 'references' | 'outputs'>

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
  /** Of what the caller can see. */
  _count: { ownedProjects: number; followers: number; following: number; collaborations: number }
  /** Whether the signed-in caller has blocked this person. */
  blockedByMe: boolean
}

export type PersonSummary = Pick<User, 'id' | 'name' | 'avatarUrl' | 'faculty' | 'campus'>

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
  status?: ProjectStatus
  tags: string[]
  details: { label: string; value: string }[]
  links: { label: string; url: string }[]
  image?: { name: string; contentType: string; dataBase64: string }
  /** True when AI filled in part of it, rather than only the page's metadata. */
  ai: boolean
}

/** The picture a link import brought back, as a file the browser can use. */
export const importedImageFile = (image: NonNullable<ImportedLink['image']>) =>
  new File([Uint8Array.from(atob(image.dataBase64), (c) => c.charCodeAt(0))], image.name, {
    type: image.contentType,
  })

export type ProjectVersion = {
  id: string
  projectId: string
  versionNum: number
  /** What changed — the line the Updates timeline shows. */
  note?: string | null
  title: string
  description?: string
  sections?: ProjectSection[] | null
  details?: ProjectDetailItem[] | null
  tags: string[]
  /** Absent on versions saved before these were recorded. */
  courseCode?: string | null
  references?: Omit<ProjectReference, 'id' | 'key'>[] | null
  /** Each names its file or link, which may have been deleted since. */
  outputs?:
    | (Pick<ProjectOutput, 'kind' | 'label' | 'primary'> & {
        file?: string
        link?: { label: string; url: string }
      })[]
    | null
  createdAt: string
}

type Person = Pick<User, 'id' | 'name' | 'avatarUrl'> & { faculty?: string }

/** GET /projects/:id/analytics — the owner's own numbers. */
export type Analytics = {
  /** Unique viewers per day, summed. */
  totalViews: number
  comments: number
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

/** One person on a project, as its owner's People dialog lists them. */
export type ProjectPerson = {
  userId: string
  user: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl' | 'faculty' | 'campus'>
  /** What they did, as the owner put it: "Designer". */
  title: string | null
  invitedAt: string
}

export type ProjectPeople = {
  collaborators: ProjectPerson[]
  /** Invited, not yet answered. */
  pending: ProjectPerson[]
  /** Invited by an address that has no account yet. */
  emailInvites: { email: string; title: string | null; invitedAt: string }[]
  /** TAs and instructors granted access to read it. */
  viewers: ProjectPerson[]
  accessRequests: ProjectPerson[]
}

/** An invitation waiting for the signed-in student's answer. */
export type PendingInvite = {
  projectId: string
  projectTitle: string
  owner: Pick<User, 'id' | 'name' | 'avatarUrl'>
  title: string | null
  invitedAt: string
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
  /** Members only — everyone else gets these fields stripped by the API. */
  contactEmail?: string
  contactRole?: string
  createdAt: string
  _count?: { members: number; projects: number }
}

export type OrgRole = 'MEMBER' | 'ADMIN'
export type OrgMemberStatus = 'ACTIVE' | 'INVITED' | 'REQUESTED'

export type OrgMember = {
  orgId: string
  userId: string
  role: OrgRole
  status: OrgMemberStatus
  joinedAt: string
  user: Pick<User, 'id' | 'name' | 'avatarUrl' | 'faculty'>
}

/** A group that invited the signed-in student. */
export type OrgInvite = OrgRef & { role: OrgRole; invitedAt: string }

/** `GET /orgs/:slug` — the group page's full payload. */
export type OrgDetail = Org & {
  /** Active members. */
  members: OrgMember[]
  /** Admins only: invitations out, and requests to join. */
  invited?: OrgMember[]
  requests?: OrgMember[]
  /** Where the caller stands with the group, and their role in it. */
  myStatus: OrgMemberStatus | null
  myRole: OrgRole | null
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

/** A report as the moderation queue sees it — reporter and project inlined. */
export type ReportTargetType = 'PROJECT' | 'COMMENT' | 'COLLECTION' | 'USER' | 'ORG_ACTIVITY'

export type AdminReport = {
  id: string
  targetType: ReportTargetType
  reason: ReportReason
  details?: string
  /** What was reported, as it read when it was reported. */
  excerpt?: string | null
  status: ReportStatus
  createdAt: string
  reviewedAt?: string
  reviewNote?: string
  reporter: Pick<User, 'id' | 'name' | 'email'>
  reviewedBy?: { id: string; name: string }
  /** Whoever posted what was reported. */
  subject: (Pick<User, 'id' | 'name' | 'email'> & { suspendedAt: string | null }) | null
  /** The project reported, or the one a reported comment is on. */
  project: {
    id: string
    title: string
    description?: string
    visibility: Visibility
    takenDownAt?: string
    owner: Pick<User, 'id' | 'name' | 'email'>
  } | null
  comment: { id: string; body: string; deletedAt: string | null } | null
  collection: { id: string; title: string; description?: string | null } | null
  activity: {
    id: string
    title: string
    description?: string | null
    org: { slug: string; name: string }
  } | null
}

/** An account as the moderators' Users tab lists it. */
export type AdminUser = Pick<User, 'id' | 'name' | 'email'> & {
  createdAt: string
  isAdmin: boolean
  suspendedAt: string | null
  messagingSuspendedAt: string | null
  _count: { ownedProjects: number; comments: number; reportsAbout: number }
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
      request<SignedIn>('/auth/login', post(body)),
    register: (body: { name: string; email: string; password: string }) =>
      request<CheckEmail>('/auth/register', post(body)),
    verify: (token: string) => request<SignedIn>('/auth/verify', post({ token })),
    resendVerification: (email: string) =>
      request<CheckEmail>('/auth/resend-verification', post({ email })),
    forgotPassword: (email: string) =>
      request<CheckEmail>('/auth/forgot-password', post({ email })),
    resetPassword: (token: string, password: string) =>
      request<SignedIn>('/auth/reset-password', post({ token, password })),
    changePassword: (body: { currentPassword?: string; newPassword: string }) =>
      request<{ ok: boolean }>('/auth/password', post(body)),
    logoutEverywhere: () => request<{ ok: boolean }>('/auth/logout-everywhere', post()),
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
    ) => request<ProjectSaved>('/projects', post(body)),
    update: (id: string, body: Partial<ProjectFields>) =>
      request<ProjectSaved>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
    save: (id: string) => request<{ saved: boolean }>(`/projects/${id}/save`, post()),
    followUpdates: (id: string) =>
      request<{ following: boolean }>(`/projects/${id}/follow`, post()),
    /** `fill: false` reads only the page's own metadata — no AI, for a thumbnail. */
    importLink: (url: string, { fill = true }: { fill?: boolean } = {}) =>
      request<ImportedLink>('/projects/import', post({ url, fill })),
    pin: (id: string) => request<{ pinned: boolean }>(`/projects/${id}/pin`, post()),
    react: (id: string, kind: ReactionKind) =>
      request<{ kind: ReactionKind; reacted: boolean }>(
        `/projects/${id}/reactions`,
        post({ kind })
      ),
    comments: (id: string) => request<CommentThread[]>(`/projects/${id}/comments`),
    addComment: (id: string, body: string, parentId?: string) =>
      request<CommentThread>(`/projects/${id}/comments`, post({ body, parentId })),
    editComment: (id: string, commentId: string, body: string) =>
      request<{ id: string; body: string; editedAt: string }>(
        `/projects/${id}/comments/${commentId}`,
        { method: 'PATCH', body: JSON.stringify({ body }) }
      ),
    deleteComment: (id: string, commentId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/comments/${commentId}`, { method: 'DELETE' }),
    reportComment: (id: string, commentId: string, body: ReportBody) =>
      request<{ id: string; status: ReportStatus }>(
        `/projects/${id}/comments/${commentId}/report`,
        post(body)
      ),
    helpful: (id: string, commentId: string) =>
      request<{ helpful: boolean; helpfulCount: number }>(
        `/projects/${id}/comments/${commentId}/helpful`,
        post()
      ),
    addLink: (id: string, link: { label: string; url: string }) =>
      request<ProjectLink>(`/projects/${id}/links`, post(link)),
    deleteLink: (id: string, linkId: string) =>
      request<{ ok: boolean }>(`/projects/${id}/links/${linkId}`, { method: 'DELETE' }),
    people: (id: string) => request<ProjectPeople>(`/projects/${id}/people`),
    cancelEmailInvite: (id: string, email: string) =>
      request<{ ok: boolean }>(`/projects/${id}/email-invites/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      }),
    inviteCollaborator: (id: string, email: string, title?: string) =>
      request<unknown>(`/projects/${id}/collaborators`, post({ email, title })),
    versions: (id: string) => request<ProjectVersion[]>(`/projects/${id}/versions`),
    /** A snapshot; with a note it is also an update on the project's timeline. */
    restoreVersion: (id: string, versionNum: number) =>
      request<{ restored: number; savedAs: number }>(
        `/projects/${id}/versions/${versionNum}/restore`,
        post()
      ),
    createVersion: (id: string, note?: string) =>
      request<ProjectVersion>(`/projects/${id}/versions`, post({ note })),
    analytics: (id: string) => request<Analytics>(`/projects/${id}/analytics`),
    requestAccess: (id: string) =>
      request<{ ok: boolean }>(`/projects/${id}/request-access`, post()),
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
    decide: (id: string, body: { decision: ReportDecision; note?: string; suspend?: boolean }) =>
      request<AdminReport>(`/admin/reports/${id}/decision`, post(body)),
    restoreProject: (id: string, note?: string) =>
      request<{ ok: boolean }>(`/admin/projects/${id}/restore`, post({ note })),
    users: (q: string) => request<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`),
    suspend: (userId: string, note?: string) =>
      request<{ ok: boolean }>(`/admin/users/${userId}/suspend`, post({ note })),
    liftSuspension: (userId: string) =>
      request<{ ok: boolean }>(`/admin/users/${userId}/suspension`, { method: 'DELETE' }),
    messageReports: (status: ReportStatus | 'all' = 'OPEN') =>
      request<AdminMessageReport[]>(`/admin/message-reports?status=${status}`),
    decideMessageReport: (id: string, body: { decision: MessageReportDecision; note?: string }) =>
      request<AdminMessageReport>(`/admin/message-reports/${id}/decision`, post(body)),
    liftMessagingSuspension: (userId: string) =>
      request<{ ok: boolean }>(`/admin/users/${userId}/messaging-suspension`, {
        method: 'DELETE',
      }),
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
        name: string
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
    reportActivity: (slug: string, id: string, body: ReportBody) =>
      request<{ id: string; status: ReportStatus }>(
        `/orgs/${slug}/activities/${id}/report`,
        post(body)
      ),
    addProject: (slug: string, projectId: string) =>
      request<unknown>(`/orgs/${slug}/projects`, post({ projectId })),
    removeProject: (slug: string, projectId: string) =>
      request<{ ok: boolean }>(`/orgs/${slug}/projects/${projectId}`, { method: 'DELETE' }),
    addMember: (slug: string, email: string, role: OrgRole = 'MEMBER') =>
      request<unknown>(`/orgs/${slug}/members`, post({ email, role })),
    join: (slug: string) => request<{ status: OrgMemberStatus }>(`/orgs/${slug}/join`, post()),
    answerInvite: (slug: string, accepted: boolean) =>
      request<{ ok: boolean }>(`/orgs/${slug}/membership`, post({ accepted })),
    updateMember: (slug: string, userId: string, body: { role?: OrgRole; approve?: boolean }) =>
      request<OrgMember>(`/orgs/${slug}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    removeMember: (slug: string, userId: string) =>
      request<{ ok: boolean }>(`/orgs/${slug}/members/${userId}`, { method: 'DELETE' }),
    delete: (slug: string) => request<{ ok: boolean }>(`/orgs/${slug}`, { method: 'DELETE' }),
    updateActivity: (
      slug: string,
      id: string,
      body: {
        title?: string
        description?: string
        date?: string
        link?: string
        imageUrl?: string
      }
    ) =>
      request<OrgActivity>(`/orgs/${slug}/activities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
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
    invites: () => request<PendingInvite[]>('/users/me/invites'),
    orgInvites: () => request<OrgInvite[]>('/users/me/org-invites'),
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
        classYear: number | null
        bio: string
        openTo: string[]
        websiteUrl: string | null
        githubUrl: string | null
        linkedinUrl: string | null
        courses: string[]
        allowMessages: boolean
        emailNotifications: boolean
      }>
    ) => request<MeUser>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
    /** A top-level download: the browser saves the JSON the API sends. */
    exportUrl: () => `${API_URL}/users/me/export`,
    deleteAccount: (confirmEmail: string) =>
      request<{ ok: boolean }>('/users/me', {
        method: 'DELETE',
        body: JSON.stringify({ confirmEmail }),
      }),
    follow: (id: string) =>
      request<{ following: boolean }>(`/users/${id}/follow`, { method: 'POST' }),
    followingMe: (id: string) => request<{ following: boolean }>(`/users/${id}/follow/me`),
    followers: (id: string, skip = 0) =>
      request<PersonSummary[]>(`/users/${id}/followers${skip ? `?skip=${skip}` : ''}`),
    following: (id: string, skip = 0) =>
      request<PersonSummary[]>(`/users/${id}/following${skip ? `?skip=${skip}` : ''}`),
    uploadAvatar: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<MeUser>('/users/me/avatar', { method: 'POST', body: form })
    },
    deleteAvatar: () => request<{ ok: boolean }>('/users/me/avatar', { method: 'DELETE' }),
    report: (id: string, body: ReportBody) =>
      request<{ id: string; status: ReportStatus }>(`/users/${id}/report`, post(body)),
  },
  courses: {
    /** 404s (as an error) for a course without one, which is most of them. */
    template: (code: string) =>
      request<CourseTemplate>(`/courses/${encodeURIComponent(code)}/template`),
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
    report: (id: string, body: ReportBody) =>
      request<{ id: string; status: ReportStatus }>(`/collections/${id}/report`, post(body)),
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
    list: (before?: string) =>
      request<{ notifications: Notification[]; unreadCount: number; nextBefore: string | null }>(
        `/users/me/notifications${before ? `?before=${encodeURIComponent(before)}` : ''}`
      ),
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
