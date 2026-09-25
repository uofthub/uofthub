export type Visibility = 'PRIVATE' | 'UOFT' | 'PUBLIC'
/** The three U of T campuses. Absent means unstated, never "all three". */
export type Campus = 'UTSG' | 'UTM' | 'UTSC'
export type CollaboratorRole = 'OWNER' | 'COLLABORATOR' | 'VIEWER'

export interface User {
  id: string
  email: string
  name: string
  faculty?: string
  campus?: Campus
  program?: string
  classYear?: number
  avatarUrl?: string
  bio?: string
  createdAt: string
}

export interface Project {
  id: string
  ownerId: string
  title: string
  description?: string
  tags: string[]
  visibility: Visibility
  /** Unique views, lifetime. Sent to the project's owner only. */
  viewCount?: number
  forkedFromId?: string
  /** Set only when a moderator has taken the project down. */
  takenDownAt?: string
  /** When it first stopped being private. Absent while it never has been. */
  publishedAt?: string
  /** Set while the owner has pinned it to the top of their profile. */
  pinnedAt?: string
  createdAt: string
  updatedAt: string
  owner?: Pick<User, 'id' | 'name' | 'faculty' | 'campus' | 'avatarUrl'>
}

export interface ProjectFile {
  id: string
  projectId: string
  name: string
  sizeBytes: number
  mimeType?: string
  uploadedAt: string
}

export interface ProjectLink {
  id: string
  projectId: string
  label: string
  url: string
}

export type NotificationType =
  | 'COLLABORATOR_INVITED'
  | 'COLLABORATOR_RESPONDED'
  | 'ACCESS_REQUESTED'
  | 'ACCESS_REQUEST_DECIDED'
  | 'PROJECT_MODERATED'
  | 'PROJECT_LIKED'
  | 'PROJECT_COMMENTED'
  | 'PROJECT_FORKED'
  | 'PROJECT_REACTED'
  | 'FOLLOWED_YOU'
  | 'FOLLOWING_PUBLISHED'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
}

/** Low-friction feedback on a project — see `ProjectReaction` in the schema. */
export type ReactionKind = 'USEFUL' | 'IMPRESSIVE' | 'WELL_DOCUMENTED' | 'WOULD_USE'

/** Verification lifecycle of a student group — see docs/student-groups.md. */
export type OrgStatus = 'PENDING_VERIFICATION' | 'IN_REVIEW' | 'INFO_REQUESTED' | 'VERIFIED'

export interface OrgActivity {
  id: string
  orgId: string
  createdById: string
  title: string
  description?: string
  date: string
  link?: string
  imageUrl?: string
  createdAt: string
  createdBy?: { id: string; name: string }
}

export type ReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'ACADEMIC_INTEGRITY'
  | 'INTELLECTUAL_PROPERTY'
  | 'PRIVACY'
  | 'OTHER'

/** `OPEN` until a moderator decides it; the rest are the decision taken. */
export type ReportStatus = 'OPEN' | 'DISMISSED' | 'WARNED' | 'TAKEN_DOWN'

export interface Report {
  id: string
  reason: ReportReason
  details?: string
  status: ReportStatus
  createdAt: string
  reviewedAt?: string
  reviewNote?: string
}

export interface Comment {
  id: string
  projectId: string
  userId: string
  body: string
  createdAt: string
  user?: Pick<User, 'id' | 'name' | 'avatarUrl'>
}
