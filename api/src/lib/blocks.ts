import { db } from '../db/client.js'

/**
 * Blocking. It began as a messages feature and reaches further now: a block
 * either way between two students also stops them commenting on each other's
 * work, replying to each other, reacting to it and following each other. The
 * blocked student is never told — what they see is the same as for anything
 * else they cannot do.
 */
export async function blockedBetween(a: string, b: string): Promise<boolean> {
  if (a === b) return false
  const found = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
  })
  return !!found
}

/** Block `blocked` for `blocker`: unfollow both ways and clear unread messages. */
export async function block(blocker: string, blocked: string): Promise<void> {
  await db.$transaction([
    db.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: blocker, blockedId: blocked } },
      create: { blockerId: blocker, blockedId: blocked },
      update: {},
    }),
    db.follow.deleteMany({
      where: {
        OR: [
          { followerId: blocker, followingId: blocked },
          { followerId: blocked, followingId: blocker },
        ],
      },
    }),
    db.message.updateMany({
      where: { senderId: blocked, recipientId: blocker, readAt: null },
      data: { readAt: new Date() },
    }),
  ])
}
