import type { FastifyRequest } from 'fastify'

/**
 * Rate-limit key for routes where the cost lands on *us* per person — a
 * moderator's attention, or model credits — rather than on the server per
 * connection.
 *
 * The default key is the IP, which is wrong here: most of campus shares a
 * handful of NAT addresses, so an IP budget lets one person exhaust the route
 * for everyone on the same wifi. The limiter runs in `onRequest`, before
 * `authenticate` has verified anything, so the raw session cookie — not
 * `request.user` — is what's available to key on. An unauthenticated request
 * falls back to the IP and gets its 401 from the preHandler regardless.
 */
export const bySession = (request: FastifyRequest): string => request.cookies?.token ?? request.ip
