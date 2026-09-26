import type { FastifyRequest, FastifyReply } from 'fastify'
import type { OAuth2Namespace } from '@fastify/oauth2'

declare module 'fastify' {
  interface FastifyInstance {
    microsoftOAuth2: OAuth2Namespace
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export interface JwtPayload {
  sub: string
  email: string
  role: 'STUDENT' | 'FACULTY'
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}
