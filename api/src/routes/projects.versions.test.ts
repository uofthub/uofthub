import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

async function snapshot(projectId: string, user: { id: string; email: string }) {
  const app = await getApp()
  return app.inject({
    method: 'POST',
    url: `/projects/${projectId}/versions`,
    cookies: await cookieFor(user),
    payload: {},
  })
}

describe('POST /projects/:id/versions', () => {
  it('numbers versions from 1 and increments per snapshot', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)

    expect((await snapshot(project.id, owner)).json().versionNum).toBe(1)
    expect((await snapshot(project.id, owner)).json().versionNum).toBe(2)
    expect((await snapshot(project.id, owner)).json().versionNum).toBe(3)
  })

  it('captures the project as it is at the moment of the snapshot', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { title: 'v1 title', description: 'first draft' })

    await snapshot(project.id, owner)
    await db.project.update({
      where: { id: project.id },
      data: { title: 'v2 title', description: 'rewritten', tags: ['CSC301'] },
    })
    await snapshot(project.id, owner)

    const versions = await db.projectVersion.findMany({
      where: { projectId: project.id },
      orderBy: { versionNum: 'asc' },
    })
    // The point of a version is that editing the project afterwards does not
    // rewrite history.
    expect(versions[0].title).toBe('v1 title')
    expect(versions[0].description).toBe('first draft')
    expect(versions[0].tags).toEqual([])
    expect(versions[1].title).toBe('v2 title')
    expect(versions[1].tags).toEqual(['CSC301'])
  })

  it('captures the course, references and outputs, naming what the outputs were', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { courseCode: 'CSC211H5' })
    const file = await db.projectFile.create({
      data: {
        projectId: project.id,
        name: 'poster.pdf',
        storageKey: 'k/poster.pdf',
        sizeBytes: 10,
      },
    })
    const link = await db.projectLink.create({
      data: { projectId: project.id, label: 'Talk', url: 'https://youtu.be/abc' },
    })
    await db.projectOutput.createMany({
      data: [
        {
          projectId: project.id,
          kind: 'POSTER',
          fileId: file.id,
          position: 0,
          primaryOfProjectId: project.id,
        },
        { projectId: project.id, kind: 'VIDEO', label: 'Talk', linkId: link.id, position: 1 },
      ],
    })
    await db.projectReference.create({
      data: { projectId: project.id, kind: 'DATASET', title: 'MNIST', year: 1998, position: 0 },
    })

    await snapshot(project.id, owner)
    // Later changes do not reach back into the version.
    await db.projectFile.delete({ where: { id: file.id } })
    await db.project.update({ where: { id: project.id }, data: { courseCode: 'CSC311H5' } })

    const version = await db.projectVersion.findFirstOrThrow({ where: { projectId: project.id } })
    expect(version.courseCode).toBe('CSC211H5')
    expect(version.references).toEqual([
      expect.objectContaining({ kind: 'DATASET', title: 'MNIST', year: 1998 }),
    ])
    expect(version.outputs).toEqual([
      { kind: 'POSTER', label: null, primary: true, file: 'poster.pdf' },
      {
        kind: 'VIDEO',
        label: 'Talk',
        primary: false,
        link: { label: 'Talk', url: 'https://youtu.be/abc' },
      },
    ])
  })

  it('numbers each project independently', async () => {
    const owner = await createUser()
    const first = await createProject(owner.id)
    const second = await createProject(owner.id)

    await snapshot(first.id, owner)
    await snapshot(first.id, owner)
    expect((await snapshot(second.id, owner)).json().versionNum).toBe(1)
  })

  it('is for the makers: the owner and accepted collaborators, not an unanswered invite', async () => {
    const owner = await createUser()
    const collaborator = await createUser()
    const invited = await createUser()
    const project = await createProject(owner.id)
    await db.projectCollaborator.createMany({
      data: [
        { projectId: project.id, userId: collaborator.id, accepted: true },
        { projectId: project.id, userId: invited.id, accepted: false },
      ],
    })

    expect((await snapshot(project.id, invited)).statusCode).toBe(403)
    expect((await snapshot(project.id, collaborator)).statusCode).toBe(201)
    expect(await db.projectVersion.count()).toBe(1)
  })

  it('404s a project that does not exist', async () => {
    const owner = await createUser()
    expect((await snapshot('11111111-1111-1111-1111-111111111111', owner)).statusCode).toBe(404)
  })
})

describe('GET /projects/:id/versions', () => {
  it('returns newest first and honours project visibility', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const project = await createProject(owner.id, { visibility: 'PRIVATE' })
    await snapshot(project.id, owner)
    await snapshot(project.id, owner)

    const app = await getApp()
    const asOwner = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/versions`,
      cookies: await cookieFor(owner),
    })
    expect(asOwner.json().map((v: { versionNum: number }) => v.versionNum)).toEqual([2, 1])

    const asStranger = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/versions`,
      cookies: await cookieFor(stranger),
    })
    expect(asStranger.statusCode).toBe(404)
  })
})

describe('POST /projects/:id/versions/:num/restore', () => {
  it('brings back the old words and references, saving the current ones first', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id, { title: 'First title' })
    await db.projectReference.create({
      data: { projectId: project.id, kind: 'PAPER', title: 'Old paper', position: 0 },
    })
    await snapshot(project.id, owner)
    await db.project.update({ where: { id: project.id }, data: { title: 'Second title' } })
    await db.projectReference.deleteMany({ where: { projectId: project.id } })

    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/versions/1/restore`,
      cookies: await cookieFor(owner),
    })
    expect(res.json()).toEqual({ restored: 1, savedAs: 2 })
    const after = await db.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { references: true },
    })
    expect(after.title).toBe('First title')
    expect(after.references.map((r) => r.title)).toEqual(['Old paper'])
    const saved = await db.projectVersion.findFirstOrThrow({ where: { versionNum: 2 } })
    expect(saved.title).toBe('Second title')
  })

  it('numbers versions saved at the same moment without clashing', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    const results = await Promise.all(Array.from({ length: 4 }, () => snapshot(project.id, owner)))
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201])
    const nums = (await db.projectVersion.findMany({ select: { versionNum: true } })).map(
      (v) => v.versionNum
    )
    expect(nums.sort()).toEqual([1, 2, 3, 4])
  })
})
