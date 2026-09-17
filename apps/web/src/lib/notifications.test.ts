import { describe, expect, it } from 'vitest'
import type { Notification, NotificationType } from '@uofthub/types'
import { messageFor } from './notifications'

const notification = (type: NotificationType, payload: Record<string, unknown>): Notification => ({
  id: 'n1',
  userId: 'u1',
  type,
  payload,
  read: false,
  createdAt: '2026-09-01T00:00:00.000Z',
})

const PROJECT = { projectId: 'p1', projectTitle: 'Autonomous gripper' }

describe('messageFor — administrative notifications', () => {
  it('names the inviter on a collaboration invite', () => {
    const { text, to } = messageFor(notification('COLLABORATOR_INVITED', { ...PROJECT, inviterName: 'Ada' }))
    expect(text).toBe('Ada invited you to collaborate on "Autonomous gripper"')
    expect(to).toBe('/projects/p1')
  })

  it('distinguishes an accepted invite from a declined one', () => {
    const accepted = messageFor(notification('COLLABORATOR_RESPONDED', { ...PROJECT, userName: 'Wei', accepted: true }))
    const declined = messageFor(notification('COLLABORATOR_RESPONDED', { ...PROJECT, userName: 'Wei', accepted: false }))
    expect(accepted.text).toContain('accepted')
    expect(declined.text).toContain('declined')
  })

  it('carries a moderator’s note when there is one', () => {
    const withNote = messageFor(
      notification('PROJECT_MODERATED', { ...PROJECT, action: 'TAKEN_DOWN', note: 'Solutions to live coursework' })
    )
    const without = messageFor(notification('PROJECT_MODERATED', { ...PROJECT, action: 'TAKEN_DOWN' }))

    expect(withNote.text).toContain('Solutions to live coursework')
    expect(without.text).toBe('"Autonomous gripper" was taken down after a report')
  })
})

describe('messageFor — social notifications', () => {
  it('names who liked the project', () => {
    const { text, to } = messageFor(notification('PROJECT_LIKED', { ...PROJECT, actorName: 'Priya' }))
    expect(text).toBe('Priya liked "Autonomous gripper"')
    expect(to).toBe('/projects/p1')
  })

  it('puts the comment itself in the notification', () => {
    // "Somebody commented on your project" is a notification you have to go
    // and decode; the comment is the thing worth being told.
    const { text } = messageFor(
      notification('PROJECT_COMMENTED', { ...PROJECT, actorName: 'Sam', excerpt: 'How did you calibrate it?' })
    )
    expect(text).toBe('Sam on "Autonomous gripper": How did you calibrate it?')
  })

  it('opens the comments tab rather than the overview it is hidden behind', () => {
    const { to } = messageFor(notification('PROJECT_COMMENTED', { ...PROJECT, actorName: 'Sam', excerpt: 'Nice' }))
    expect(to).toBe('/projects/p1?tab=comments')
  })

  it('still reads correctly when a comment has no excerpt', () => {
    const { text } = messageFor(notification('PROJECT_COMMENTED', { ...PROJECT, actorName: 'Sam' }))
    expect(text).toBe('Sam commented on "Autonomous gripper"')
  })

  it('says what a reader found, not just that they reacted', () => {
    expect(messageFor(notification('PROJECT_REACTED', { ...PROJECT, actorName: 'Wei', kind: 'USEFUL' })).text).toBe(
      'Wei found "Autonomous gripper" useful'
    )
    expect(
      messageFor(notification('PROJECT_REACTED', { ...PROJECT, actorName: 'Wei', kind: 'WELL_DOCUMENTED' })).text
    ).toBe('Wei found "Autonomous gripper" well documented')
  })

  it('falls back rather than printing a raw enum for an unknown reaction', () => {
    // A kind added server-side before the web app knows about it must not
    // surface as `found "X" undefined`.
    const { text } = messageFor(notification('PROJECT_REACTED', { ...PROJECT, actorName: 'Wei', kind: 'NEW_KIND' }))
    expect(text).toBe('Wei left feedback on "Autonomous gripper"')
  })

  it('names who forked it', () => {
    expect(messageFor(notification('PROJECT_FORKED', { ...PROJECT, actorName: 'Wei' })).text).toBe(
      'Wei forked "Autonomous gripper"'
    )
  })

  it('sends a new follower to their profile, not to a project', () => {
    const { text, to } = messageFor(notification('FOLLOWED_YOU', { actorId: 'u9', actorName: 'Ada' }))
    expect(text).toBe('Ada followed you')
    expect(to).toBe('/u/u9')
  })

  it('announces a publish from somebody you follow', () => {
    const { text, to } = messageFor(notification('FOLLOWING_PUBLISHED', { ...PROJECT, ownerName: 'Ada' }))
    expect(text).toBe('Ada published "Autonomous gripper"')
    expect(to).toBe('/projects/p1')
  })
})

describe('messageFor — malformed payloads', () => {
  it('falls back to the home page when there is no project to link to', () => {
    expect(messageFor(notification('PROJECT_LIKED', { actorName: 'Priya' })).to).toBe('/')
    expect(messageFor(notification('FOLLOWED_YOU', { actorName: 'Ada' })).to).toBe('/')
  })

  it('returns a message for every type rather than rendering nothing', () => {
    // A notification with no case here renders as an empty row in the bell,
    // which reads as a bug rather than as a missing translation.
    const types: NotificationType[] = [
      'COLLABORATOR_INVITED',
      'COLLABORATOR_RESPONDED',
      'ACCESS_REQUESTED',
      'ACCESS_REQUEST_DECIDED',
      'PROJECT_MODERATED',
      'PROJECT_LIKED',
      'PROJECT_COMMENTED',
      'PROJECT_FORKED',
      'PROJECT_REACTED',
      'FOLLOWED_YOU',
      'FOLLOWING_PUBLISHED',
    ]
    for (const type of types) {
      expect(messageFor(notification(type, PROJECT)).text).toBeTruthy()
    }
  })
})
