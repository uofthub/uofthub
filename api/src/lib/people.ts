import type { Prisma } from '@prisma/client'

/**
 * Lists of people — search results, a course's classmates. A profile is
 * public by link, but a list is a directory, so these are for signed-in
 * students only and leave out anyone who could not be found on purpose:
 * unconfirmed and suspended accounts, and anyone blocked either way.
 */
export const listablePeopleWhere = (viewerId: string): Prisma.UserWhereInput => ({
  emailVerifiedAt: { not: null },
  suspendedAt: null,
  blocking: { none: { blockedId: viewerId } },
  blockedBy: { none: { blockerId: viewerId } },
})

export const PERSON_RESULT_SELECT = {
  id: true,
  handle: true,
  name: true,
  avatarUrl: true,
  faculty: true,
  campus: true,
  program: true,
  _count: { select: { followers: true } },
} as const

type Row = Prisma.UserGetPayload<{ select: typeof PERSON_RESULT_SELECT }>

export const toPersonResult = ({ _count, ...person }: Row) => ({
  ...person,
  followerCount: _count.followers,
})
