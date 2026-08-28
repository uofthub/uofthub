export type Visibility = 'PRIVATE' | 'UOFT' | 'PUBLIC'
export type CollaboratorRole = 'OWNER' | 'COLLABORATOR' | 'VIEWER'

export interface User {
  id: string
  email: string
  name: string
  faculty?: string
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
  viewCount: number
  forkedFromId?: string
  /** Set only when a moderator has taken the project down. */
  takenDownAt?: string
  createdAt: string
  updatedAt: string
  owner?: Pick<User, 'id' | 'name' | 'faculty'>
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

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
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
