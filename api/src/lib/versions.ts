import { Prisma, type ReferenceKind } from '@prisma/client'
import { db } from '../db/client.js'
import { parseReferences, type ReferenceRow } from './references.js'
import { mergeChanges, type Change } from './changes.js'
import { VIEW_CHECK_SELECT, canViewProject } from './visibility.js'
import { notifyMany } from './notifications.js'

/**
 * Versions: a project's content snapshotted as it stood, numbered from 1.
 *
 * A snapshot names its outputs rather than pointing at them — the file or
 * link may be gone by the time anyone looks back — so restoring one brings
 * back the words, details, tags, course and references, and leaves the
 * files and outputs as they are now.
 */

/** A project's content as it stands now, in a version's columns. */
async function currentContent(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      references: {
        orderBy: { position: 'asc' },
        select: {
          kind: true,
          title: true,
          url: true,
          doi: true,
          authors: true,
          year: true,
          note: true,
        },
      },
      outputs: {
        orderBy: { position: 'asc' },
        select: {
          kind: true,
          label: true,
          primaryOfProjectId: true,
          file: { select: { name: true } },
          link: { select: { label: true, url: true } },
        },
      },
    },
  })

  return {
    title: project.title,
    description: project.description,
    sections: project.sections ?? Prisma.DbNull,
    details: project.details ?? Prisma.DbNull,
    tags: project.tags,
    courseCode: project.courseCode,
    references: project.references,
    outputs: project.outputs.map((o) => ({
      kind: o.kind,
      label: o.label,
      primary: o.primaryOfProjectId !== null,
      ...(o.file && { file: o.file.name }),
      ...(o.link && { link: o.link }),
    })),
  }
}

/** Snapshot a project's current content as its next version. */
export async function snapshotVersion(
  projectId: string,
  note: string | null,
  made: { authorId?: string; changes?: Change[] } = {}
) {
  const data = {
    projectId,
    note,
    authorId: made.authorId,
    changes: made.changes ? (made.changes as Prisma.InputJsonValue) : Prisma.DbNull,
    ...(await currentContent(projectId)),
  }

  // Two saves at the same moment would both read the same latest number; the
  // unique (projectId, versionNum) refuses the second, which takes the next.
  for (let attempt = 0; ; attempt++) {
    const latest = await db.projectVersion.findFirst({
      where: { projectId },
      orderBy: { versionNum: 'desc' },
      select: { versionNum: true },
    })
    try {
      return await db.projectVersion.create({
        data: { ...data, versionNum: (latest?.versionNum ?? 0) + 1 },
      })
    } catch (err) {
      const clash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
      if (!clash || attempt >= 4) throw err
    }
  }
}

/**
 * Put a version's content back on its project, after snapshotting what is
 * there now so nothing is lost by restoring. Returns the snapshot's number.
 */
export async function restoreVersion(projectId: string, versionNum: number, authorId: string) {
  const version = await db.projectVersion.findUnique({
    where: { projectId_versionNum: { projectId, versionNum } },
  })
  if (!version) return null

  const saved = await snapshotVersion(projectId, null)
  // Stored references went through the same parser when they were saved, so
  // they parse again; anything that no longer does is left out.
  const parsed = parseReferences(
    ((version.references as { kind: ReferenceKind }[] | null) ?? []) as unknown
  )
  const references: ReferenceRow[] = 'error' in parsed ? [] : parsed.value

  await db.$transaction([
    db.projectReference.deleteMany({ where: { projectId } }),
    db.projectReference.createMany({ data: references.map((r) => ({ ...r, projectId })) }),
    db.project.update({
      where: { id: projectId },
      data: {
        title: version.title,
        description: version.description,
        sections: version.sections ?? Prisma.DbNull,
        details: version.details ?? Prisma.DbNull,
        tags: version.tags,
        courseCode: version.courseCode,
      },
    }),
  ])
  await logChanges(projectId, authorId, [{ kind: 'restored', versionNum }])
  return { restored: versionNum, savedAs: saved.versionNum }
}

/**
 * Tell a project's followers about a new version. Only the ones who can still
 * see it — it may have gone back to a draft since they followed — and never
 * whoever made the change.
 */
export async function notifyFollowers(
  projectId: string,
  versionId: string,
  authorId: string,
  payload: Record<string, unknown>
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { title: true, takenDownAt: true, ...VIEW_CHECK_SELECT },
  })
  if (!project || project.takenDownAt) return
  const followers = await db.projectFollow.findMany({
    where: { projectId },
    select: { userId: true },
  })
  const audience = followers
    .map((f) => f.userId)
    .filter((userId) => userId !== authorId && canViewProject(project, userId))
  await notifyMany(
    audience,
    'PROJECT_UPDATED',
    { projectId, projectTitle: project.title, ...payload },
    `update:${versionId}`
  )
}

/**
 * How long one person's edits keep folding into the version their first one
 * made. An editor save is several requests — uploads, the content, deletions
 * — and a student fixing a typo a minute later is still the same sitting.
 */
export const CHANGE_WINDOW_MS = 15 * 60 * 1000

/**
 * Record what an edit changed, as a version on the Updates timeline.
 *
 * Only once the project is out: before it is published nobody else can see
 * it, and the timeline begins at "Published". Edits by the same person inside
 * `CHANGE_WINDOW_MS` of their last recorded one refresh that version rather
 * than adding another, and followers hear once per sitting, not per request.
 */
export async function logChanges(projectId: string, authorId: string, changes: Change[]) {
  if (changes.length === 0) return
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { publishedAt: true },
  })
  if (!project?.publishedAt || project.publishedAt > new Date()) return

  const latest = await db.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNum: 'desc' },
    select: { id: true, note: true, changes: true, authorId: true, createdAt: true },
  })
  if (
    latest &&
    latest.note === null &&
    Array.isArray(latest.changes) &&
    latest.authorId === authorId &&
    Date.now() - latest.createdAt.getTime() < CHANGE_WINDOW_MS
  ) {
    const merged = mergeChanges(latest.changes as Change[], changes)
    // Renamed and renamed back: nothing happened worth a line.
    if (merged.length === 0) {
      await db.projectVersion.delete({ where: { id: latest.id } })
      return
    }
    await db.projectVersion.update({
      where: { id: latest.id },
      data: { changes: merged as Prisma.InputJsonValue, ...(await currentContent(projectId)) },
    })
    return
  }

  const version = await snapshotVersion(projectId, null, { authorId, changes })
  await notifyFollowers(projectId, version.id, authorId, { changes })
}
