import { Prisma, type ReferenceKind } from '@prisma/client'
import { db } from '../db/client.js'
import { parseReferences, type ReferenceRow } from './references.js'

/**
 * Versions: a project's content snapshotted as it stood, numbered from 1.
 *
 * A snapshot names its outputs rather than pointing at them — the file or
 * link may be gone by the time anyone looks back — so restoring one brings
 * back the words, details, tags, course and references, and leaves the
 * files and outputs as they are now.
 */

/** Snapshot a project's current content as its next version. */
export async function snapshotVersion(projectId: string, note: string | null) {
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

  const data = {
    projectId,
    note,
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
export async function restoreVersion(projectId: string, versionNum: number) {
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
  return { restored: versionNum, savedAs: saved.versionNum }
}
