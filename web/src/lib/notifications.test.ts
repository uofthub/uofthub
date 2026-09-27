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
    const { text, to } = messageFor(
      notification('COLLABORATOR_INVITED', { ...PROJECT, inviterName: 'Ada' })
    )
    expect(text).toBe('Ada invited you to collaborate on "Autonomous gripper"')
    expect(to).toBe('/projects/p1')
  })

  it('distinguishes an accepted invite from a declined one', () => {
    const accepted = messageFor(
      notification('COLLABORATOR_RESPONDED', { ...PROJECT, userName: 'Wei', accepted: true })
    )
    const declined = messageFor(
      notification('COLLABORATOR_RESPONDED', { ...PROJECT, userName: 'Wei', accepted: false })
    )
    expect(accepted.text).toContain('accepted')
    expect(declined.text).toContain('declined')
  })

  it('carries a moderator’s note when there is one', () => {
    const withNote = messageFor(
      notification('PROJECT_MODERATED', {
        ...PROJECT,
        action: 'TAKEN_DOWN',
        note: 'Solutions to live coursework',
      })
    )
    const without = messageFor(
      notification('PROJECT_MODERATED', { ...PROJECT, action: 'TAKEN_DOWN' })
    )

    expect(withNote.text).toContain('Solutions to live coursework')
    expect(without.text).toBe('"Autonomous gripper" was taken down after a report')
  })

  it('tells a sender their messaging was suspended, and sends them to their messages', () => {
    const { text, to } = messageFor(
      notification('MESSAGING_MODERATED', { action: 'TAKEN_DOWN', note: 'Stop sending ads' })
    )
    expect(text).toBe('A moderator suspended your messaging after a report: Stop sending ads')
    expect(to).toBe('/messages')
    expect(messageFor(notification('MESSAGING_MODERATED', { action: 'WARNED' })).text).toBe(
      'A moderator reviewed a report about your messages'
    )
  })
})

describe('messageFor — social notifications', () => {
  it('names who liked the project', () => {
    const { text, to } = messageFor(
      notification('PROJECT_LIKED', { ...PROJECT, actorName: 'Priya' })
    )
    expect(text).toBe('Priya liked "Autonomous gripper"')
    expect(to).toBe('/projects/p1')
  })

  it('puts the comment itself in the notification', () => {
    // "Somebody commented on your project" is a notification you have to go
    // and decode; the comment is the thing worth being told.
    const { text } = messageFor(
      notification('PROJECT_COMMENTED', {
        ...PROJECT,
        actorName: 'Sam',
        excerpt: 'How did you calibrate it?',
      })
    )
    expect(text).toBe('Sam on "Autonomous gripper": How did you calibrate it?')
  })

  it('lands on the comments rather than the top of the project page', () => {
    const { to } = messageFor(
      notification('PROJECT_COMMENTED', { ...PROJECT, actorName: 'Sam', excerpt: 'Nice' })
    )
    expect(to).toBe('/projects/p1#comments')
  })

  it('still reads correctly when a comment has no excerpt', () => {
    const { text } = messageFor(notification('PROJECT_COMMENTED', { ...PROJECT, actorName: 'Sam' }))
    expect(text).toBe('Sam commented on "Autonomous gripper"')
  })

  it('says what a reader found, not just that they reacted', () => {
    // USEFUL is offered as "Learned something", so it is announced that way.
    expect(
      messageFor(notification('PROJECT_REACTED', { ...PROJECT, actorName: 'Wei', kind: 'USEFUL' }))
        .text
    ).toBe('Wei learned something from "Autonomous gripper"')
    expect(
      messageFor(
        notification('PROJECT_REACTED', { ...PROJECT, actorName: 'Wei', kind: 'IMPRESSIVE' })
      ).text
    ).toBe('Wei found "Autonomous gripper" impressive')
    expect(
      messageFor(
        notification('PROJECT_REACTED', { ...PROJECT, actorName: 'Wei', kind: 'WELL_DOCUMENTED' })
      ).text
    ).toBe('Wei found "Autonomous gripper" well documented')
  })

  it('falls back rather than printing a raw enum for an unknown reaction', () => {
    // A kind added server-side before the web app knows about it must not
    // surface as `found "X" undefined`.
    const { text } = messageFor(
      notification('PROJECT_REACTED', { ...PROJECT, actorName: 'Wei', kind: 'NEW_KIND' })
    )
    expect(text).toBe('Wei left feedback on "Autonomous gripper"')
  })

  it('sends an offer to collaborate to the person who made it', () => {
    const n = messageFor(
      notification('PROJECT_COLLAB_INTEREST', { ...PROJECT, actorName: 'Omar', actorId: 'u9' })
    )
    expect(n.text).toBe('Omar wants to collaborate on "Autonomous gripper"')
    expect(n.to).toBe('/u/u9')
  })

  it('quotes a reply and lands on the comments', () => {
    const n = messageFor(
      notification('COMMENT_REPLIED', { ...PROJECT, actorName: 'Liam', excerpt: 'I can help' })
    )
    expect(n.text).toBe('Liam replied on "Autonomous gripper": I can help')
    expect(n.to).toBe('/projects/p1#comments')
  })

  it('sends a new follower to their profile, not to a project', () => {
    const { text, to } = messageFor(
      notification('FOLLOWED_YOU', { actorId: 'u9', actorName: 'Ada' })
    )
    expect(text).toBe('Ada followed you')
    expect(to).toBe('/u/u9')
  })

  it('announces a publish from somebody you follow', () => {
    const { text, to } = messageFor(
      notification('FOLLOWING_PUBLISHED', { ...PROJECT, ownerName: 'Ada' })
    )
    expect(text).toBe('Ada published "Autonomous gripper"')
    expect(to).toBe('/projects/p1')
  })

  it('carries the note of an update to a project you follow, and opens the timeline', () => {
    const { text, to } = messageFor(
      notification('PROJECT_UPDATED', { ...PROJECT, note: 'Added a second gripper arm' })
    )
    expect(text).toBe('Update on "Autonomous gripper": Added a second gripper arm')
    expect(to).toBe('/projects/p1#updates')
  })

  it('says what an edit changed when there is no note', () => {
    const { text, to } = messageFor(
      notification('PROJECT_UPDATED', {
        ...PROJECT,
        changes: [
          { kind: 'status', to: 'HELP_WANTED' },
          { kind: 'added', what: 'file', name: 'demo.mp4' },
          { kind: 'edited', part: 'description' },
        ],
      })
    )
    expect(text).toBe(
      '"Autonomous gripper" changed: Marked it looking for help, added the file “demo.mp4” and 1 more'
    )
    expect(to).toBe('/projects/p1#updates')
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
      'PROJECT_REACTED',
      'FOLLOWED_YOU',
      'FOLLOWING_PUBLISHED',
      'PROJECT_COLLAB_INTEREST',
      'COMMENT_REPLIED',
      'PROJECT_UPDATED',
      'MESSAGING_MODERATED',
    ]
    for (const type of types) {
      expect(messageFor(notification(type, PROJECT)).text).toBeTruthy()
    }
  })
})
