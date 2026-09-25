/** PRIVATE is shown as "Draft"; UNLISTED opens for anyone with the link but is never listed. */
export type Visibility = 'PRIVATE' | 'UOFT' | 'PUBLIC' | 'UNLISTED'
/** What kind of work a project is — decides its badge and main action. */
export type ProjectType =
  'APP' | 'RESEARCH' | 'FILM' | 'DESIGN' | 'AUDIO' | 'HARDWARE' | 'WRITING' | 'OTHER'
/** Where a project stands. HELP_WANTED feeds the "Looking for help" list. */
export type ProjectStatus = 'IN_PROGRESS' | 'SHIPPED' | 'HELP_WANTED'
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
  /** "Open to" chips on the profile. */
  openTo?: string[]
  websiteUrl?: string | null
  githubUrl?: string | null
  linkedinUrl?: string | null
  /** Course codes the student says they take. */
  courses?: string[]
  /** Whether other students may start a conversation with them. */
  allowMessages?: boolean
  createdAt: string
}

export interface Project {
  id: string
  ownerId: string
  title: string
  /** The one line a card shows. */
  pitch?: string
  /** The story, in Markdown. */
  description?: string
  type?: ProjectType
  status?: ProjectStatus
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
  | 'PROJECT_COLLAB_INTEREST'
  | 'COMMENT_REPLIED'
  | 'PROJECT_UPDATED'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
}

/**
 * The three reactions — the app's only public engagement signal. USEFUL is
 * shown as "Learned something"; COLLAB ("Want to collab") is counted publicly
 * but who made it is only ever shown to the owner.
 */
export type ReactionKind = 'USEFUL' | 'IMPRESSIVE' | 'COLLAB'

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
  'SPAM' | 'HARASSMENT' | 'ACADEMIC_INTEGRITY' | 'INTELLECTUAL_PROPERTY' | 'PRIVACY' | 'OTHER'

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
  /** Set on a reply; replies are one level deep. */
  parentId?: string | null
  body: string
  createdAt: string
  user?: Pick<User, 'id' | 'name' | 'avatarUrl' | 'faculty'>
  helpfulCount: number
  helpfulByMe: boolean
}

/** A top-level comment as GET /projects/:id/comments returns it. */
export interface CommentThread extends Comment {
  replies: Comment[]
}
