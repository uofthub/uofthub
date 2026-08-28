import { describe, expect, it } from 'vitest'
import { canViewProject } from './visibility.js'

const project = (
  visibility: 'PRIVATE' | 'UOFT' | 'PUBLIC',
  collaborators: { userId: string; accepted: boolean }[] = []
) => ({ ownerId: 'owner', visibility, collaborators })

describe('canViewProject', () => {
  it('shows PUBLIC projects to everyone, signed in or not', () => {
    expect(canViewProject(project('PUBLIC'), null)).toBe(true)
    expect(canViewProject(project('PUBLIC'), 'stranger')).toBe(true)
  })

  it('shows UOFT projects to any signed-in user but nobody else', () => {
    // Signing in already required a utoronto.ca address, so "signed in" and
    // "is a U of T member" are the same statement here.
    expect(canViewProject(project('UOFT'), 'stranger')).toBe(true)
    expect(canViewProject(project('UOFT'), null)).toBe(false)
  })

  it('shows PRIVATE projects to the owner only', () => {
    expect(canViewProject(project('PRIVATE'), 'owner')).toBe(true)
    expect(canViewProject(project('PRIVATE'), 'stranger')).toBe(false)
    expect(canViewProject(project('PRIVATE'), null)).toBe(false)
  })

  it('admits an accepted collaborator to a PRIVATE project, but not a pending one', () => {
    const pending = project('PRIVATE', [{ userId: 'invitee', accepted: false }])
    const accepted = project('PRIVATE', [{ userId: 'invitee', accepted: true }])
    expect(canViewProject(pending, 'invitee')).toBe(false)
    expect(canViewProject(accepted, 'invitee')).toBe(true)
  })

  it('grants owner access only when collaborators were not loaded', () => {
    // Callers may omit the relation; the rule degrades to owner-only rather
    // than throwing or silently granting access.
    const withoutRelation = { ownerId: 'owner', visibility: 'PRIVATE' as const }
    expect(canViewProject(withoutRelation, 'owner')).toBe(true)
    expect(canViewProject(withoutRelation, 'invitee')).toBe(false)
  })
})
