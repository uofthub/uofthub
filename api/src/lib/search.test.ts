import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { searchProjectIds, toPrefixTsQuery } from './search.js'
import { createProject, createUser, resetDb } from '../test/helpers.js'

beforeEach(resetDb)

describe('toPrefixTsQuery', () => {
  it('makes every term a prefix so type-ahead matches', () => {
    expect(toPrefixTsQuery('machine learning')).toBe('machine:* & learning:*')
  })

  it('drops punctuation rather than escaping it, so nothing reaches to_tsquery as syntax', () => {
    expect(toPrefixTsQuery('robots & !(lasers)')).toBe('robots:* & lasers:*')
  })

  it('returns null when there is nothing searchable left', () => {
    expect(toPrefixTsQuery('  &&& ')).toBeNull()
    expect(toPrefixTsQuery('')).toBeNull()
  })

  it('caps the number of terms', () => {
    const query = toPrefixTsQuery('a b c d e f g h i j k')!
    expect(query.split(' & ')).toHaveLength(8)
  })
})

describe('searchProjectIds', () => {
  async function seed() {
    const owner = await createUser()
    const robotics = await createProject(owner.id, {
      title: 'Autonomous robotics arm',
      description: 'A gripper controlled by reinforcement learning.',
    })
    const essay = await createProject(owner.id, {
      title: 'Essay on urban planning',
      description: 'Zoning in Scarborough.',
    })
    await db.project.update({ where: { id: robotics.id }, data: { tags: ['CSC309', 'hardware'] } })
    return { robotics, essay }
  }

  it('matches on the title', async () => {
    const { robotics } = await seed()
    expect(await searchProjectIds('robotics')).toEqual([robotics.id])
  })

  it('matches on the description', async () => {
    const { essay } = await seed()
    expect(await searchProjectIds('zoning')).toEqual([essay.id])
  })

  it('matches on a tag, including a course code', async () => {
    const { robotics } = await seed()
    expect(await searchProjectIds('CSC309')).toEqual([robotics.id])
  })

  it('matches a prefix, so a half-typed query still finds the project', async () => {
    const { robotics } = await seed()
    expect(await searchProjectIds('robo')).toEqual([robotics.id])
  })

  it('stems, so "planning" and "planned" reach the same project', async () => {
    const { essay } = await seed()
    expect(await searchProjectIds('planned')).toEqual([essay.id])
  })

  it('requires every term to match, not any', async () => {
    await seed()
    expect(await searchProjectIds('robotics zoning')).toEqual([])
  })

  it('ranks a title match above a description-only match', async () => {
    const owner = await createUser()
    const inTitle = await createProject(owner.id, { title: 'Gripper', description: 'An arm.' })
    await createProject(owner.id, { title: 'Unrelated', description: 'Mentions a gripper once.' })

    const ids = await searchProjectIds('gripper')
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(inTitle.id)
  })

  it('treats an unsearchable query as no matches, never as no filter', async () => {
    await seed()
    expect(await searchProjectIds('!!!')).toEqual([])
  })

  it('no longer matches mid-word substrings — the documented cost of the index', async () => {
    await seed()
    // 'botic' is inside 'robotics', which the old ILIKE '%…%' would have found.
    expect(await searchProjectIds('botic')).toEqual([])
  })
})
