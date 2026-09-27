import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'
import { mergeChanges } from '../lib/changes.js'

beforeEach(resetDb)

async function patch(
  projectId: string,
  user: { id: string; email: string },
  payload: Record<string, unknown>
) {
  const app = await getApp()
  return app.inject({
    method: 'PATCH',
    url: `/projects/${projectId}`,
    cookies: await cookieFor(user),
    payload,
  })
}

const versionsOf = (projectId: string) =>
  db.projectVersion.findMany({ where: { projectId }, orderBy: { versionNum: 'asc' } })

describe('edits on the Updates timeline', () => {
  it('records what a settings edit changed', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { title: 'Old name', visibility: 'UOFT' })

    const res = await patch(project.id, owner, {
      title: 'New name',
      status: 'HELP_WANTED',
      helpNeeded: 'A designer for the map view',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().helpNeeded).toBe('A designer for the map view')

    const [version] = await versionsOf(project.id)
    expect(version.note).toBeNull()
    expect(version.authorId).toBe(owner.id)
    expect(version.title).toBe('New name')
    expect(version.changes).toEqual([
      { kind: 'renamed', from: 'Old name', to: 'New name' },
      { kind: 'status', to: 'HELP_WANTED' },
      { kind: 'edited', part: 'helpNeeded' },
    ])
  })

  it('records nothing for a save that changed nothing', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { title: 'Same', visibility: 'UOFT' })
    await patch(project.id, owner, { title: 'Same', tags: [], references: [] })
    expect(await versionsOf(project.id)).toHaveLength(0)
  })

  it('records nothing while the project is still a draft', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { title: 'Draft' })
    await patch(project.id, owner, { title: 'Still a draft' })
    // The edit that publishes it is the timeline's "Published", not a change.
    await patch(project.id, owner, { visibility: 'UOFT' })
    expect(await versionsOf(project.id)).toHaveLength(0)
  })

  it('folds one sitting of edits, links included, into one version', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { title: 'A', visibility: 'UOFT' })
    const app = await getApp()
    const cookies = await cookieFor(owner)

    await patch(project.id, owner, { title: 'B' })
    const link = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/links`,
      cookies,
      payload: { label: 'Demo', url: 'https://example.com/demo' },
    })
    expect(link.statusCode).toBe(201)
    await patch(project.id, owner, { title: 'C' })

    const versions = await versionsOf(project.id)
    expect(versions).toHaveLength(1)
    expect(versions[0].title).toBe('C')
    expect(versions[0].changes).toEqual([
      { kind: 'renamed', from: 'A', to: 'C' },
      { kind: 'added', what: 'link', name: 'Demo' },
    ])

    // Removing it again in the same sitting leaves only the rename.
    await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/links/${link.json().id}`,
      cookies,
    })
    expect((await versionsOf(project.id))[0].changes).toEqual([
      { kind: 'renamed', from: 'A', to: 'C' },
    ])
  })

  it('starts a new version after the window, or for another editor', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { title: 'A', visibility: 'UOFT' })
    await patch(project.id, owner, { title: 'B' })
    await db.projectVersion.updateMany({
      where: { projectId: project.id },
      data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    })
    await patch(project.id, owner, { title: 'C' })
    expect(await versionsOf(project.id)).toHaveLength(2)
  })

  it('tells followers once per sitting, but not the one who made it', async () => {
    const owner = await createUser()
    const follower = await createUser()
    const project = await createProject(owner.id, { title: 'A', visibility: 'UOFT' })
    await db.projectFollow.create({ data: { userId: follower.id, projectId: project.id } })

    await patch(project.id, owner, { title: 'B' })
    await patch(project.id, owner, { status: 'SHIPPED' })

    const notes = await db.notification.findMany({ where: { type: 'PROJECT_UPDATED' } })
    expect(notes).toHaveLength(1)
    expect(notes[0].userId).toBe(follower.id)
    expect(notes[0].payload).toMatchObject({
      projectId: project.id,
      changes: [{ kind: 'renamed', from: 'A', to: 'B' }],
    })
  })
})

describe('mergeChanges', () => {
  it('drops a rename back to where it started', () => {
    expect(
      mergeChanges(
        [{ kind: 'renamed', from: 'A', to: 'B' }],
        [{ kind: 'renamed', from: 'B', to: 'A' }]
      )
    ).toEqual([])
  })

  it('keeps the latest status', () => {
    expect(
      mergeChanges([{ kind: 'status', to: 'HELP_WANTED' }], [{ kind: 'status', to: 'SHIPPED' }])
    ).toEqual([{ kind: 'status', to: 'SHIPPED' }])
  })
})
