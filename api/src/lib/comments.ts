import { db } from '../db/client.js'

/**
 * Remove a comment. One with replies keeps its place, emptied and marked
 * deleted, so the answers under it still read as a thread; one without goes
 * entirely, with its Helpful votes.
 */
export async function removeComment(id: string, hasReplies: boolean): Promise<void> {
  if (hasReplies) {
    await db.$transaction([
      db.comment.update({ where: { id }, data: { body: '', deletedAt: new Date() } }),
      db.commentHelpful.deleteMany({ where: { commentId: id } }),
    ])
  } else {
    await db.comment.delete({ where: { id } })
  }
}
