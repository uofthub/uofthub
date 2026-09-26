import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import {
  checkUrl,
  decodeEntities,
  githubRepo,
  isPublicAddress,
  readPageMeta,
} from '../lib/linkImport.js'
import { cookieFor, createProject, createUser, getApp, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

/**
 * What used to be "coming soon" in the redesign: profile "Open to" and links,
 * stated courses, following a project's updates, collections, direct
 * messages, and starting a post from a link.
 */

type User = { id: string; email: string }

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  user?: User,
  payload?: unknown
) {
  const app = await getApp()
  return app.inject({
    method,
    url,
    ...(user ? { cookies: await cookieFor(user) } : {}),
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  })
}

describe('profile', () => {
  it('stores "Open to", links and courses, and shows them on the profile', async () => {
    const me = await createUser()
    const res = await call('PATCH', '/users/me', me, {
      openTo: ['Collaboration', ' Summer 2027 internships ', 'collaboration'],
      websiteUrl: 'https://maya.dev',
      githubUrl: 'https://github.com/maya',
      linkedinUrl: 'https://ca.linkedin.com/in/maya',
      courses: ['csc343', 'MAT137Y1'],
    })
    expect(res.statusCode).toBe(200)

    const profile = (await call('GET', `/users/${me.id}`)).json()
    expect(profile.openTo).toEqual(['Collaboration', 'Summer 2027 internships'])
    expect(profile.githubUrl).toBe('https://github.com/maya')
    expect(profile.courses).toEqual(['CSC343', 'MAT137Y1'])
    expect(profile.allowMessages).toBe(true)
  })

  it('refuses links that point somewhere other than their label says', async () => {
    const me = await createUser()
    expect(
      (await call('PATCH', '/users/me', me, { githubUrl: 'https://evil.example/maya' })).statusCode
    ).toBe(400)
    expect(
      (await call('PATCH', '/users/me', me, { websiteUrl: 'javascript:alert(1)' })).statusCode
    ).toBe(400)
    expect(
      (await call('PATCH', '/users/me', me, { linkedinUrl: 'https://linkedin.com.evil.example' }))
        .statusCode
    ).toBe(400)
  })

  it('clears a link with an empty string, and refuses non-course codes and long lists', async () => {
    const me = await createUser()
    await call('PATCH', '/users/me', me, { websiteUrl: 'https://maya.dev' })
    await call('PATCH', '/users/me', me, { websiteUrl: '' })
    expect((await call('GET', `/users/${me.id}`)).json().websiteUrl).toBeNull()

    expect((await call('PATCH', '/users/me', me, { courses: ['Robotics'] })).statusCode).toBe(400)
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect((await call('PATCH', '/users/me', me, { openTo: seven })).statusCode).toBe(400)
  })

  it('uses stated courses in the feed, before anything is published', async () => {
    const me = await createUser()
    const other = await createUser()
    await call('PATCH', '/users/me', me, { courses: ['CSC343'] })
    await createProject(other.id, { visibility: 'UOFT', tags: ['CSC343'], title: 'Seatfinder' })

    const feed = (await call('GET', '/feed', me)).json()
    expect(feed.items[0].reason).toEqual({ kind: 'COURSE', tag: 'CSC343' })
  })
})

describe('following a project', () => {
  it('toggles, is private to the follower, and shows the owner a count', async () => {
    const owner = await createUser()
    const fan = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })

    expect((await call('POST', `/projects/${project.id}/follow`, fan)).json()).toEqual({
      following: true,
    })
    expect((await call('GET', `/projects/${project.id}`, fan)).json().following).toBe(true)
    expect((await call('GET', `/projects/${project.id}`, fan)).json().followerCount).toBeUndefined()
    expect((await call('GET', `/projects/${project.id}`, owner)).json().followerCount).toBe(1)
    expect(await db.notification.count({ where: { userId: owner.id } })).toBe(0)

    expect((await call('POST', `/projects/${project.id}/follow`, fan)).json()).toEqual({
      following: false,
    })
  })

  it('refuses your own project and one you cannot see', async () => {
    const owner = await createUser()
    const other = await createUser()
    const mine = await createProject(owner.id, { visibility: 'PUBLIC' })
    const draft = await createProject(owner.id, { visibility: 'PRIVATE' })
    expect((await call('POST', `/projects/${mine.id}/follow`, owner)).statusCode).toBe(400)
    expect((await call('POST', `/projects/${draft.id}/follow`, other)).statusCode).toBe(404)
  })

  it('tells followers about an update, not a silent version, and not once it is a draft', async () => {
    const owner = await createUser()
    const fan = await createUser()
    const project = await createProject(owner.id, { visibility: 'PUBLIC' })
    await call('POST', `/projects/${project.id}/follow`, fan)

    await call('POST', `/projects/${project.id}/versions`, owner, {})
    await call('POST', `/projects/${project.id}/versions`, owner, { note: 'Added Gerstein' })
    const told = await db.notification.findMany({ where: { userId: fan.id } })
    expect(told.map((n) => n.type)).toEqual(['PROJECT_UPDATED'])
    expect(told[0].payload).toMatchObject({ projectId: project.id, note: 'Added Gerstein' })

    await db.project.update({ where: { id: project.id }, data: { visibility: 'PRIVATE' } })
    await call('POST', `/projects/${project.id}/versions`, owner, { note: 'Hidden now' })
    expect(await db.notification.count({ where: { userId: fan.id } })).toBe(1)
  })
})

describe('collections', () => {
  it('creates one with a project, lists it with a preview, and shows it', async () => {
    const me = await createUser()
    const project = await createProject(me.id, { visibility: 'PUBLIC', title: 'Seatfinder' })

    const created = await call('POST', '/collections', me, {
      title: '  Best of   UTM 2026 ',
      projectId: project.id,
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().title).toBe('Best of UTM 2026')

    const list = (await call('GET', '/collections')).json()
    expect(list).toHaveLength(1)
    expect(list[0].projectCount).toBe(1)
    expect(list[0].preview[0].title).toBe('Seatfinder')

    const one = (await call('GET', `/collections/${created.json().id}`)).json()
    expect(one.projects.map((p: { title: string }) => p.title)).toEqual(['Seatfinder'])
  })

  it('only admits listed projects, and shows each reader only what they may see', async () => {
    const me = await createUser()
    const draft = await createProject(me.id, { visibility: 'PRIVATE' })
    const linkOnly = await createProject(me.id, { visibility: 'UNLISTED' })
    const campusOnly = await createProject(me.id, { visibility: 'UOFT', title: 'Campus only' })
    const { id } = (await call('POST', '/collections', me, { title: 'Mine' })).json()

    for (const p of [draft, linkOnly])
      expect(
        (await call('POST', `/collections/${id}/items`, me, { projectId: p.id })).statusCode
      ).toBe(400)
    expect(
      (await call('POST', `/collections/${id}/items`, me, { projectId: campusOnly.id })).statusCode
    ).toBe(200)

    // Signed out: the U of T-only project is hidden, and so is the collection.
    expect((await call('GET', `/collections/${id}`)).json().projects).toHaveLength(0)
    expect((await call('GET', '/collections')).json()).toHaveLength(0)
    const reader = await createUser()
    expect((await call('GET', '/collections', reader)).json()[0].projectCount).toBe(1)
  })

  it('lets only the curator change it, and a moderator delete it', async () => {
    const me = await createUser()
    const other = await createUser()
    const admin = await createUser({ isAdmin: true })
    const project = await createProject(me.id, { visibility: 'PUBLIC' })
    const { id } = (await call('POST', '/collections', me, { title: 'Mine' })).json()

    expect((await call('PATCH', `/collections/${id}`, other, { title: 'Theirs' })).statusCode).toBe(
      403
    )
    expect(
      (await call('POST', `/collections/${id}/items`, other, { projectId: project.id })).statusCode
    ).toBe(403)
    expect((await call('DELETE', `/collections/${id}`, other)).statusCode).toBe(403)

    const mine = (await call('GET', `/collections/mine?projectId=${project.id}`, me)).json()
    expect(mine[0]).toMatchObject({ id, hasProject: false })

    expect((await call('DELETE', `/collections/${id}`, admin)).statusCode).toBe(200)
  })
})

describe('messages', () => {
  it('sends, lists the conversation with an unread count, and marks it read on opening', async () => {
    const a = await createUser({ name: 'Aisha' })
    const b = await createUser({ name: 'Ben' })

    expect((await call('POST', `/messages/${b.id}`, a, { body: 'Hi Ben' })).statusCode).toBe(201)
    await call('POST', `/messages/${b.id}`, a, { body: 'About your project' })

    expect((await call('GET', '/messages/unread', b)).json()).toEqual({ count: 2 })
    const convos = (await call('GET', '/messages', b)).json()
    expect(convos).toHaveLength(1)
    expect(convos[0]).toMatchObject({ user: { name: 'Aisha' }, unread: 2 })
    expect(convos[0].lastMessage).toMatchObject({ body: 'About your project', fromMe: false })

    const thread = (await call('GET', `/messages/${a.id}`, b)).json()
    expect(thread.messages.map((m: { body: string }) => m.body)).toEqual([
      'Hi Ben',
      'About your project',
    ])
    expect((await call('GET', '/messages/unread', b)).json()).toEqual({ count: 0 })
  })

  it('stops strangers when turned off, but still lets people you wrote to answer', async () => {
    const a = await createUser()
    const b = await createUser()
    await call('PATCH', '/users/me', b, { allowMessages: false })

    expect((await call('POST', `/messages/${b.id}`, a, { body: 'Hi' })).statusCode).toBe(403)
    expect((await call('GET', `/messages/${b.id}`, a)).json().canMessage).toBe(false)

    expect((await call('POST', `/messages/${a.id}`, b, { body: 'Hi first' })).statusCode).toBe(201)
    expect((await call('POST', `/messages/${b.id}`, a, { body: 'Hi back' })).statusCode).toBe(201)
  })

  it('blocks both ways, without telling the blocked person, until unblocked', async () => {
    const a = await createUser()
    const b = await createUser()
    await call('POST', `/messages/${b.id}`, a, { body: 'Hi' })
    await call('POST', `/messages/${b.id}`, a, { body: 'Hello?' })

    expect((await call('POST', `/messages/${a.id}/block`, b)).statusCode).toBe(200)
    // Blocking clears what they had sent, so the badge stops asking.
    expect((await call('GET', '/messages/unread', b)).json()).toEqual({ count: 0 })
    expect((await call('GET', '/messages', b)).json()[0].blocked).toBe(true)

    const theirs = await call('POST', `/messages/${b.id}`, a, { body: 'Why no answer' })
    expect(theirs.statusCode).toBe(403)
    expect(theirs.json().error).toBe('They are not taking new messages')
    expect((await call('GET', `/messages/${b.id}`, a)).json()).toMatchObject({
      canMessage: false,
      closed: 'unavailable',
    })

    expect((await call('GET', `/messages/${a.id}`, b)).json().closed).toBe('blocked')
    expect((await call('POST', `/messages/${a.id}`, b, { body: 'Stop' })).statusCode).toBe(403)

    await call('DELETE', `/messages/${a.id}/block`, b)
    expect((await call('POST', `/messages/${b.id}`, a, { body: 'Sorry' })).statusCode).toBe(201)
  })

  it('reports a conversation with its recent thread, and blocks unless asked not to', async () => {
    const a = await createUser({ name: 'Aisha' })
    const b = await createUser({ name: 'Ben' })
    const admin = await createUser({ isAdmin: true })

    // Nothing to report until they have written to you.
    await call('POST', `/messages/${a.id}`, b, { body: 'Hi' })
    expect(
      (await call('POST', `/messages/${a.id}/report`, b, { reason: 'HARASSMENT' })).statusCode
    ).toBe(400)

    await call('POST', `/messages/${b.id}`, a, { body: 'Something nasty' })
    expect((await call('GET', `/messages/${a.id}`, b)).json().canReport).toBe(true)
    expect((await call('POST', `/messages/${a.id}/report`, b, { reason: 'NOPE' })).statusCode).toBe(
      400
    )
    const filed = await call('POST', `/messages/${a.id}/report`, b, {
      reason: 'HARASSMENT',
      details: '  Keeps going  ',
    })
    expect(filed.statusCode).toBe(201)
    expect((await call('POST', `/messages/${a.id}/report`, b, { reason: 'SPAM' })).statusCode).toBe(
      409
    )
    expect((await call('GET', `/messages/${a.id}`, b)).json()).toMatchObject({
      reported: true,
      closed: 'blocked',
    })

    // Moderators only.
    expect((await call('GET', '/admin/message-reports', b)).statusCode).toBe(403)
    const queue = (await call('GET', '/admin/message-reports', admin)).json()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      reason: 'HARASSMENT',
      details: 'Keeps going',
      reporter: { name: 'Ben' },
      reported: { name: 'Aisha', messagingSuspendedAt: null },
    })
    expect(queue[0].messages.map((m: { body: string }) => m.body)).toEqual([
      'Hi',
      'Something nasty',
    ])

    const other = await createUser()
    await call('POST', `/messages/${other.id}`, a, { body: 'Hi' })
    await call('POST', `/messages/${a.id}/report`, other, { reason: 'SPAM', block: false })
    expect((await call('GET', `/messages/${a.id}`, other)).json().closed).toBeNull()
  })

  it('lets a moderator warn, or suspend and later lift, the sender', async () => {
    const a = await createUser()
    const b = await createUser()
    const c = await createUser()
    const admin = await createUser({ isAdmin: true })
    for (const who of [b, c]) {
      await call('POST', `/messages/${who.id}`, a, { body: 'Spam' })
      await call('POST', `/messages/${a.id}/report`, who, { reason: 'SPAM', block: false })
    }
    const [first] = (await call('GET', '/admin/message-reports', admin)).json()

    const decided = await call('POST', `/admin/message-reports/${first.id}/decision`, admin, {
      decision: 'SUSPEND',
      note: 'Stop sending ads',
    })
    expect(decided.statusCode).toBe(200)
    expect(decided.json().status).toBe('TAKEN_DOWN')
    // One decision closes every open report about the same sender.
    expect((await call('GET', '/admin/message-reports', admin)).json()).toHaveLength(0)
    expect(
      (
        await call('POST', `/admin/message-reports/${first.id}/decision`, admin, {
          decision: 'WARN',
        })
      ).statusCode
    ).toBe(409)

    const refused = await call('POST', `/messages/${b.id}`, a, { body: 'More spam' })
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error).toBe('A moderator has suspended your messaging')
    expect((await call('GET', `/messages/${b.id}`, a)).json().closed).toBe('suspended')

    const notes = (await call('GET', '/users/me/notifications', a)).json().notifications
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      type: 'MESSAGING_MODERATED',
      payload: { action: 'TAKEN_DOWN', note: 'Stop sending ads' },
    })

    expect(
      (await call('DELETE', `/admin/users/${a.id}/messaging-suspension`, admin)).statusCode
    ).toBe(200)
    expect((await call('POST', `/messages/${b.id}`, a, { body: 'Sorry' })).statusCode).toBe(201)
    expect(
      (await call('DELETE', `/admin/users/${a.id}/messaging-suspension`, admin)).statusCode
    ).toBe(404)
  })

  it('refuses an empty or huge message, yourself and strangers without a session', async () => {
    const a = await createUser()
    const b = await createUser()
    expect((await call('POST', `/messages/${b.id}`, a, { body: '   ' })).statusCode).toBe(400)
    expect(
      (await call('POST', `/messages/${b.id}`, a, { body: 'x'.repeat(2001) })).statusCode
    ).toBe(400)
    expect((await call('POST', `/messages/${a.id}`, a, { body: 'me' })).statusCode).toBe(404)
    expect((await call('POST', `/messages/${b.id}`, undefined, { body: 'hi' })).statusCode).toBe(
      401
    )
  })
})

describe('import from a link', () => {
  it('never reaches a private, loopback or metadata address', async () => {
    const me = await createUser()
    for (const url of [
      'http://127.0.0.1/',
      'http://localhost:80/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/',
      'http://[::1]/',
      'http://[::ffff:192.168.1.1]/',
      'http://example.com:5432/',
      'file:///etc/passwd',
      'http://user:pw@example.com/',
    ]) {
      const res = await call('POST', '/projects/import', me, { url })
      expect(res.statusCode, url).toBe(422)
    }
    expect(
      (await call('POST', '/projects/import', undefined, { url: 'https://example.com' })).statusCode
    ).toBe(401)
  })

  it('classifies addresses', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
    for (const a of [
      '10.1.2.3',
      '172.20.0.1',
      '192.168.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '0.0.0.0',
    ])
      expect(isPublicAddress(a), a).toBe(false)
    expect(() => checkUrl('https://example.com/a')).not.toThrow()
  })

  it('reads a page’s own title, description and image', () => {
    const html = `<html><head>
      <title>Fallback</title>
      <meta content="Seatfinder &amp; friends" property="og:title">
      <meta name='description' content='Live map of open study seats'>
      <meta property="og:image" content="/img/cover.png">
    </head></html>`
    expect(readPageMeta(html, new URL('https://seatfinder.app/about'))).toEqual({
      title: 'Seatfinder & friends',
      pitch: 'Live map of open study seats',
      image: 'https://seatfinder.app/img/cover.png',
    })
    expect(readPageMeta('<title> Just a title </title>', new URL('https://x.dev'))).toMatchObject({
      title: 'Just a title',
      pitch: undefined,
    })
    expect(decodeEntities('&#x27;hi&#39; &lt;3')).toBe("'hi' <3")
  })

  it('recognises a GitHub repository link', () => {
    expect(githubRepo(new URL('https://github.com/uofthub/seatfinder.git'))).toEqual({
      owner: 'uofthub',
      repo: 'seatfinder',
    })
    expect(githubRepo(new URL('https://github.com/uofthub'))).toBeNull()
    expect(githubRepo(new URL('https://gitlab.com/a/b'))).toBeNull()
  })
})
