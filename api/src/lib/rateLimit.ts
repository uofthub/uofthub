import type { FastifyRequest } from 'fastify'

/**
 * Rate-limit key for routes where the cost lands on *us* per person — a
 * moderator's attention, or model credits — rather than on the server per
 * connection.
 *
 * The default key is the IP, which is wrong here: most of campus shares a
 * handful of NAT addresses, so an IP budget lets one person exhaust the route
 * for everyone on the same wifi. The limiter runs in `onRequest`, before
 * `authenticate`, so the key comes from verifying the session token here.
 *
 * It is the verified account id, never the token's bytes: a key made of
 * whatever the client sent is one the client can change on every request —
 * a fresh junk cookie per call was a fresh bucket per call. A request with no
 * valid session falls back to the IP and gets its 401 from the preHandler
 * regardless.
 */
export async function bySession(request: FastifyRequest): Promise<string> {
  try {
    const { sub } = await request.jwtVerify<{ sub: string }>()
    return `user:${sub}`
  } catch {
    return `ip:${request.ip}`
  }
}
