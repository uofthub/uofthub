import type { NotificationType, Prisma } from '@prisma/client'
import { db } from '../db/client.js'

export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>
): Promise<void> {
  await db.notification.create({
    data: { userId, type, payload: payload as Prisma.InputJsonValue },
  })
}
