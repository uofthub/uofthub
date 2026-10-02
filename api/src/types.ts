import type { FastifyRequest, FastifyReply } from 'fastify'
import type { OAuth2Namespace } from '@fastify/oauth2'

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Lets a suspended account, or one that has not agreed to the current
     * Terms, use this write route anyway — signing out, deleting or exporting
     * its own things, or agreeing. See `authenticate` in app.ts.
     */
    allowSuspended?: boolean
  }
  interface FastifyInstance {
    microsoftOAuth2: OAuth2Namespace
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export interface JwtPayload {
  sub: string
  email: string
  /** The account's sessionVersion when this token was issued — see lib/session.ts. */
  sv?: number
  /** This session's own id, so signing out can end it alone — see lib/session.ts. */
  jti?: string
  /** Expiry, in seconds since the epoch; set by the signer. */
  exp?: number
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}
