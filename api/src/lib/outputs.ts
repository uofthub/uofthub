import type { OutputKind, Prisma } from '@prisma/client'
import { fileTypeFromBuffer } from 'file-type'
import { z } from 'zod'
import { safeExternalUrl } from './url.js'

/**
 * A project's outputs: what it produced, in order, with one of them primary.
 *
 * An output is a layer over a file or a link the project already has — it
 * says "this PDF is the poster" and "this is the one to lead with" without
 * copying anything. Saving a project with `outputs` replaces the whole list,
 * the way references work, inside the same transaction as the rest of the
 * edit (see PATCH /projects/:id).
 */

export const OUTPUT_KINDS = [
  'POSTER',
  'SLIDES',
  'PAPER',
  'VIDEO',
  'AUDIO',
  'DEMO',
  'CODE',
  'DATASET',
  'OTHER',
] as const satisfies readonly OutputKind[]

export const OUTPUT_LIMIT = 20
const LABEL_MAX = 80

const Base = {
  /** An existing output's id, so a reorder keeps its thumbnail. */
  id: z.string().uuid('Unknown output').optional(),
  kind: z.enum(OUTPUT_KINDS, { error: 'Unknown output kind' }),
  label: z
    .string()
    .trim()
    .max(LABEL_MAX, `An output’s label is at most ${LABEL_MAX} characters`)
    .optional()
    .nullable(),
  primary: z.boolean().optional(),
}

const OutputsInput = z
  .array(
    z.union(
      [
        z.object({ ...Base, fileId: z.string().uuid('Unknown file') }),
        z.object({ ...Base, linkId: z.string().uuid('Unknown link') }),
        z.object({
          ...Base,
          link: z.object({
            label: z.string().trim().max(LABEL_MAX).optional().default(''),
            url: z.string(),
          }),
        }),
      ],
      { error: 'Each output is a file, an existing link, or a new link' }
    ),
    { error: 'Outputs must be a list' }
  )
  .max(OUTPUT_LIMIT, `A project has at most ${OUTPUT_LIMIT} outputs`)

export type OutputsPlan = z.infer<typeof OutputsInput>

export function parseOutputs(input: unknown): { value: OutputsPlan } | { error: string } {
  if (input === null) return { value: [] }
  const parsed = OutputsInput.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid outputs' }
  const outputs = parsed.data
  if (outputs.filter((o) => o.primary).length > 1)
    return { error: 'Only one output can be the primary one' }
  const files = outputs.flatMap((o) => ('fileId' in o ? [o.fileId] : []))
  if (new Set(files).size !== files.length) return { error: 'A file is listed as two outputs' }
  const links = outputs.flatMap((o) => ('linkId' in o ? [o.linkId] : []))
  if (new Set(links).size !== links.length) return { error: 'A link is listed as two outputs' }
  for (const o of outputs) {
    if ('link' in o && !safeExternalUrl(o.link.url))
      return { error: 'An output’s link must be an http(s) URL' }
  }
  return { value: outputs }
}

/** Thrown inside the save transaction to roll it back with a 400. */
export class OutputError extends Error {}

/**
 * Replace a project's outputs with `plan`, inside the caller's transaction.
 * Returns the thumbnail keys of outputs that went away (removed, or pointed at
 * something else), for the caller to delete from storage once it commits.
 */
export async function applyOutputs(
  tx: Prisma.TransactionClient,
  projectId: string,
  plan: OutputsPlan
): Promise<string[]> {
  const [existing, files, links] = await Promise.all([
    tx.projectOutput.findMany({ where: { projectId } }),
    tx.projectFile.findMany({ where: { projectId }, select: { id: true } }),
    tx.projectLink.findMany({ where: { projectId }, select: { id: true } }),
  ])
  const byId = new Map(existing.map((o) => [o.id, o]))
  const ownFiles = new Set(files.map((f) => f.id))
  const ownLinks = new Set(links.map((l) => l.id))
  const orphaned: string[] = []

  // Every output this project should end with, resolved to a target, before
  // anything is written — so a bad row fails the save without half-applying.
  const rows: {
    id?: string
    kind: OutputKind
    label: string | null
    fileId: string | null
    linkId: string | null
    primary: boolean
    newLink?: { label: string; url: string }
  }[] = []
  for (const o of plan) {
    if (o.id && !byId.has(o.id)) throw new OutputError('Unknown output')
    if ('fileId' in o && !ownFiles.has(o.fileId)) throw new OutputError('Unknown file')
    if ('linkId' in o && !ownLinks.has(o.linkId)) throw new OutputError('Unknown link')
    rows.push({
      id: o.id,
      kind: o.kind,
      label: o.label || null,
      fileId: 'fileId' in o ? o.fileId : null,
      linkId: 'linkId' in o ? o.linkId : null,
      primary: !!o.primary,
      ...('link' in o && {
        newLink: { label: o.link.label, url: safeExternalUrl(o.link.url)! },
      }),
    })
  }

  // The list is rewritten whole: every output is deleted and the new list
  // created in order, keeping the id (and so the thumbnail) of each one that
  // stays. Updating rows in place would have to shuffle unique targets and
  // the primary marker between them one statement at a time, and the
  // one-target CHECK allows no intermediate state to do that in.
  await tx.projectOutput.deleteMany({ where: { projectId } })

  const listed = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])))
  for (const o of existing) if (!listed.has(o.id) && o.thumbnailKey) orphaned.push(o.thumbnailKey)

  for (const [position, row] of rows.entries()) {
    let linkId = row.linkId
    if (row.newLink) {
      const link = await tx.projectLink.create({ data: { projectId, ...row.newLink } })
      linkId = link.id
    }
    // A thumbnail belongs to what it was made from: it survives a reorder or
    // relabel, not a change of target. Outputs removed from the list leave
    // their files and links behind — an output only ever said what they were.
    const before = row.id ? byId.get(row.id) : undefined
    const sameTarget = !!before && before.fileId === row.fileId && before.linkId === linkId
    if (before?.thumbnailKey && !sameTarget) orphaned.push(before.thumbnailKey)
    await tx.projectOutput.create({
      data: {
        ...(row.id && { id: row.id }),
        projectId,
        kind: row.kind,
        label: row.label,
        fileId: row.fileId,
        linkId,
        position,
        primaryOfProjectId: row.primary ? projectId : null,
        thumbnailKey: sameTarget ? before!.thumbnailKey : null,
      },
    })
  }
  return orphaned
}

/* -------------------------------- thumbnails ------------------------------- */

/**
 * A thumbnail is made in the author's browser, so it is untrusted: it must
 * really be a raster image (checked by its bytes, not its name), and small.
 * SVG is refused — it is a document, not a picture.
 */
export const THUMBNAIL_MAX_BYTES = 512 * 1024
const THUMBNAIL_TYPES = new Map([
  ['webp', 'image/webp'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
])

export async function thumbnailType(buffer: Buffer): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer)
  return (detected && THUMBNAIL_TYPES.get(detected.ext)) ?? null
}

export const thumbnailKeyFor = (projectId: string, outputId: string, contentType: string) =>
  `projects/${projectId}/thumbs/${outputId}-${Date.now().toString(36)}.${contentType.split('/')[1]}`

/** The type a stored thumbnail is served as, read back off its key. */
export function thumbnailContentType(key: string): string {
  const ext = key.split('.').pop() ?? ''
  return ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp'
}
