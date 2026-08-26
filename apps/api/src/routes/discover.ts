import type { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db/client.js'

let anthropic: Anthropic | null = null

function getClient(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set')
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

interface DiscoverParams {
  search?: string
  faculty?: string
  sort?: 'new' | 'trending'
}

async function parseQuery(query: string): Promise<DiscoverParams> {
  const client = getClient()

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 256,
    system: `You extract search parameters from natural language queries about a university student project platform called uofthub.
Return ONLY valid JSON with these optional fields:
- search: keyword string for title/description/tag search
- faculty: one of "Arts & Science", "Engineering", "Medicine", "Law", "Education", "Rotman", "Music", "Architecture"
- sort: "trending" or "new"

Examples:
"show me machine learning projects" → {"search":"machine learning"}
"trending engineering projects" → {"faculty":"Engineering","sort":"trending"}
"new AI projects from CS students" → {"search":"AI","faculty":"Arts & Science","sort":"new"}
"what are students building in medicine" → {"faculty":"Medicine"}`,
    messages: [{ role: 'user', content: query }],
  })

  const text = response.content.find(b => b.type === 'text')?.text ?? '{}'
  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    return {
      search: typeof json.search === 'string' ? json.search : undefined,
      faculty: typeof json.faculty === 'string' ? json.faculty : undefined,
      sort: json.sort === 'trending' ? 'trending' : json.sort === 'new' ? 'new' : undefined,
    }
  } catch {
    return {}
  }
}

export const discoverRoutes: FastifyPluginAsync = async (app) => {
  // GET /discover?q=natural+language+query
  app.get<{ Querystring: { q?: string } }>('/', async (request, reply) => {
    const { q } = request.query

    if (!q?.trim()) {
      return reply.code(400).send({ error: 'q parameter required' })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return reply.code(503).send({ error: 'AI discovery is not configured (ANTHROPIC_API_KEY missing)' })
    }

    let params: DiscoverParams
    try {
      params = await parseQuery(q)
    } catch (err) {
      app.log.error(err, 'Claude query parsing failed')
      return reply.code(502).send({ error: 'AI query parsing failed' })
    }

    const projects = await db.project.findMany({
      where: {
        visibility: 'PUBLIC',
        ...(params.search && {
          OR: [
            { title: { contains: params.search, mode: 'insensitive' } },
            { description: { contains: params.search, mode: 'insensitive' } },
            { tags: { has: params.search } },
          ],
        }),
        ...(params.faculty && {
          owner: { faculty: { contains: params.faculty, mode: 'insensitive' } },
        }),
      },
      include: {
        owner: { select: { id: true, name: true, faculty: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: params.sort === 'trending'
        ? [{ viewCount: 'desc' }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }],
      take: 20,
    })

    return { params, projects }
  })
}
