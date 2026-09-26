import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { createProject, createUser, resetDb } from '../test/helpers.js'
import { announceDueProjects } from './announcements.js'

beforeEach(resetDb)

/**
 * The sweep that tells followers about a project when its show-from date
 * arrives. It runs at boot and on an interval, possibly on several instances
 * at once, so "exactly once" is the whole point.
 */

const DAY = 24 * 60 * 60 * 1000

async function seed(overrides: Parameters<typeof createProject>[1] = {}) {
  const owner = await createUser()
  const follower = await createUser()
  await db.follow.create({ data: { followerId: follower.id, followingId: owner.id } })
  const showFrom = new Date(Date.now() + 7 * DAY)
  const project = await createProject(owner.id, { visibility: 'UOFT', showFrom, ...overrides })
  const announcements = () =>
    db.notification.count({ where: { userId: follower.id, type: 'FOLLOWING_PUBLISHED' } })
  return { project, showFrom, announcements }
}

describe('announceDueProjects', () => {
  it('does not announce a hidden project before its date', async () => {
    const { showFrom, announcements } = await seed()
    expect(await announceDueProjects(new Date())).toEqual([])
    expect(await announceDueProjects(new Date(showFrom.getTime() - 1))).toEqual([])
    expect(await announcements()).toBe(0)
  })

  it('announces it once its date has come, dated the moment it appeared', async () => {
    const { project, showFrom, announcements } = await seed()
    const after = new Date(showFrom.getTime() + 60_000)

    expect(await announceDueProjects(after)).toEqual([project.id])
    expect(await announcements()).toBe(1)
    const row = await db.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(row.publishedAt).toEqual(showFrom)
    expect(row.announcedAt).toEqual(after)
  })

  it('does not announce it again on a later run, as after a restart', async () => {
    const { showFrom, announcements } = await seed()
    const after = new Date(showFrom.getTime() + 60_000)
    await announceDueProjects(after)
    expect(await announceDueProjects(after)).toEqual([])
    expect(await announceDueProjects(new Date(after.getTime() + DAY))).toEqual([])
    expect(await announcements()).toBe(1)
  })

  it('announces it once when two runs overlap', async () => {
    const { showFrom, announcements } = await seed()
    const after = new Date(showFrom.getTime() + 60_000)
    const runs = await Promise.all([announceDueProjects(after), announceDueProjects(after)])
    expect(runs.flat()).toHaveLength(1)
    expect(await announcements()).toBe(1)
  })

  it('skips a project that went back to private, link-only or was taken down', async () => {
    const drafts = await Promise.all([
      seed({ visibility: 'PRIVATE', publishedAt: null }),
      seed({ visibility: 'UNLISTED', publishedAt: null }),
      seed(),
    ])
    await db.project.update({
      where: { id: drafts[2].project.id },
      data: { takenDownAt: new Date(), visibility: 'PRIVATE' },
    })
    const after = new Date(drafts[0].showFrom.getTime() + DAY)
    expect(await announceDueProjects(after)).toEqual([])
  })

  it('leaves projects published before show-from dates existed alone', async () => {
    const owner = await createUser()
    await createProject(owner.id, { visibility: 'PUBLIC' })
    expect(await announceDueProjects(new Date(Date.now() + DAY))).toEqual([])
  })
})
