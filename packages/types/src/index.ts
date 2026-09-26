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

/**
 * The optional sections a project can hold beyond its overview. Each is shown
 * only when it has something in it. `custom` may repeat and carries its own
 * title; every other kind appears at most once. Mirrored as a value list in
 * api/src/lib/projectContent.ts, which is compile-checked against this.
 */
export type SectionKind =
  | 'motivation'
  | 'method'
  | 'approaches'
  | 'data'
  | 'results'
  | 'examples'
  | 'considerations'
  | 'reflection'
  | 'conclusion'
  | 'custom'

/** One approach of an "approaches compared" section, or one example. */
export interface ProjectSectionItem {
  label: string
  body?: string
}

export interface ProjectSection {
  /** Stable per project; the section's anchor on the page. */
  id: string
  kind: SectionKind
  /** Overrides the label the project's type gives this kind. Required for `custom`. */
  title?: string
  /** Markdown. */
  body?: string
  /** `approaches` and `examples` only. */
  items?: ProjectSectionItem[]
}

/** What a project drew on. */
export type ReferenceKind =
  'DATASET' | 'PAPER' | 'SOFTWARE' | 'MODEL' | 'BOOK' | 'ARCHIVE' | 'WEBSITE' | 'OTHER'

export interface ProjectReference {
  id: string
  kind: ReferenceKind
  title: string
  url?: string | null
  /** Bare: 10.1000/xyz. */
  doi?: string | null
  authors?: string | null
  year?: number | null
  note?: string | null
  /** Normalized identity shared by every project citing the same thing. */
  key?: string | null
}

/** What an output is. */
export type OutputKind =
  'POSTER' | 'SLIDES' | 'PAPER' | 'VIDEO' | 'AUDIO' | 'DEMO' | 'CODE' | 'DATASET' | 'OTHER'

/** Something the project produced: one of its files or links, in the author's order. */
export interface ProjectOutput {
  id: string
  kind: OutputKind
  /** Overrides the kind's label. */
  label?: string | null
  fileId?: string | null
  linkId?: string | null
  /** The one the project leads with; its thumbnail is the project's image. */
  primary: boolean
  /** Signed and short-lived. Absent when there is no thumbnail. */
  thumbnailUrl?: string
}

/** A short labelled fact: Supervisor, Runtime, Performers. */
export interface ProjectDetailItem {
  label: string
  value: string
}

export interface Project {
  id: string
  ownerId: string
  title: string
  /** The one line a card shows. */
  pitch?: string
  /** The overview, in Markdown. */
  description?: string
  /** Only on a single project, never on list rows. Absent or null when there are none. */
  sections?: ProjectSection[] | null
  /** Only on a single project, never on list rows. Absent or null when there are none. */
  details?: ProjectDetailItem[] | null
  /** Set while the project is hidden until a date (only its makers see it then). */
  showFrom?: string | null
  type?: ProjectType
  status?: ProjectStatus
  tags: string[]
  /** The course it was made for, upper-cased: CSC211H5. */
  courseCode?: string | null
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
  | 'MESSAGING_MODERATED'

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
