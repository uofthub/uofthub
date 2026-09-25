import { describe, expect, it } from 'vitest'
import type { Visibility } from '@prisma/client'
import { canViewProject, isListed } from './visibility.js'

const project = (
  visibility: Visibility,
  collaborators: { userId: string; accepted: boolean }[] = [],
  showFrom: Date | null = null
) => ({ ownerId: 'owner', visibility, collaborators, showFrom })

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

  it('shows UNLISTED projects to anyone holding the id', () => {
    expect(canViewProject(project('UNLISTED'), null)).toBe(true)
    expect(canViewProject(project('UNLISTED'), 'stranger')).toBe(true)
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
    const withoutRelation = { ownerId: 'owner', visibility: 'PRIVATE' as const, showFrom: null }
    expect(canViewProject(withoutRelation, 'owner')).toBe(true)
    expect(canViewProject(withoutRelation, 'invitee')).toBe(false)
  })
})

describe('canViewProject with a show-from date', () => {
  const now = new Date('2026-12-01T12:00:00Z')
  const later = new Date('2026-12-20T05:00:00Z')
  const earlier = new Date('2026-11-01T04:00:00Z')
  const team = [
    { userId: 'collaborator', accepted: true },
    { userId: 'invitee', accepted: false },
  ]

  it('hides a project from everyone but its makers until the date, whatever its visibility', () => {
    for (const visibility of ['PUBLIC', 'UOFT', 'UNLISTED', 'PRIVATE'] as const) {
      const hidden = project(visibility, team, later)
      expect(canViewProject(hidden, null, now), visibility).toBe(false)
      expect(canViewProject(hidden, 'stranger', now), visibility).toBe(false)
      expect(canViewProject(hidden, 'invitee', now), visibility).toBe(false)
      expect(canViewProject(hidden, 'owner', now), visibility).toBe(true)
      expect(canViewProject(hidden, 'collaborator', now), visibility).toBe(true)
    }
  })

  it('shows it by its visibility from the moment the date arrives', () => {
    expect(canViewProject(project('PUBLIC', [], later), null, later)).toBe(true)
    expect(canViewProject(project('UOFT', [], later), 'stranger', later)).toBe(true)
    expect(canViewProject(project('UOFT', [], later), null, later)).toBe(false)
  })

  it('does nothing once the date has passed', () => {
    expect(canViewProject(project('PUBLIC', [], earlier), null, now)).toBe(true)
    expect(canViewProject(project('PRIVATE', [], earlier), 'stranger', now)).toBe(false)
  })
})

describe('isListed', () => {
  const now = new Date('2026-12-01T12:00:00Z')
  const listed = (
    visibility: Visibility,
    extra: { takenDownAt?: Date; showFrom?: Date } = {}
  ) =>
    isListed(
      { visibility, takenDownAt: extra.takenDownAt ?? null, showFrom: extra.showFrom ?? null },
      now
    )

  it('lists public and U of T projects only', () => {
    expect(listed('PUBLIC')).toBe(true)
    expect(listed('UOFT')).toBe(true)
    expect(listed('UNLISTED')).toBe(false)
    expect(listed('PRIVATE')).toBe(false)
  })

  it('never lists a taken-down or still-hidden project', () => {
    expect(listed('PUBLIC', { takenDownAt: new Date('2026-11-01') })).toBe(false)
    expect(listed('PUBLIC', { showFrom: new Date('2026-12-20') })).toBe(false)
    expect(listed('PUBLIC', { showFrom: new Date('2026-11-20') })).toBe(true)
  })
})
