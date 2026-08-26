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
  createdAt: string
  updatedAt: string
  owner?: Pick<User, 'id' | 'name' | 'faculty'>
}

export interface ProjectFile {
  id: string
  projectId: string
  name: string
  url: string
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

export interface Comment {
  id: string
  projectId: string
  userId: string
  body: string
  createdAt: string
  user?: Pick<User, 'id' | 'name' | 'avatarUrl'>
}
