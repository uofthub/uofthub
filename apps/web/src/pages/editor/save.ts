import type { Visibility } from '@uofthub/types'
import type { api as Api } from '../../lib/api'
import { contentPayload, outputsPayload, type Draft } from './draft'

/**
 * Saving a project from the editor, in an order that can never leave
 * something half-made in front of anyone.
 *
 *   1. A new project is created as a private draft, with its text.
 *   2. New files are uploaded.
 *   3. The content — sections, details, references, outputs — is written in
 *      one request, which the API applies in one transaction.
 *   4. Thumbnails are uploaded for the outputs that have new ones.
 *   5. Invitations go out.
 *   6. Only if every step above succeeded, visibility and the show-from date
 *      are written, on their own, last.
 *
 * A failure anywhere before step 6 leaves a new project as a private draft
 * that only its author can see, with the failures listed so they can fix them
 * and save again. A project that was already visible stays exactly as visible
 * as it was: step 6 is what would change that, and it does not run.
 */

type ProjectsApi = Pick<
  typeof Api.projects,
  'create' | 'update' | 'uploadFile' | 'uploadThumbnail' | 'deleteThumbnail' | 'inviteCollaborator'
>

export type SaveResult = {
  projectId: string
  /** One line per thing that did not go through, for the author to act on. */
  failed: string[]
  /** Whether step 6 ran — the chosen visibility is now the project's. */
  visibilityApplied: boolean
  /** What did get through, so a retry does not do it twice (see `settle`). */
  uploaded: Map<File, string>
  /** Draft output key → the id the API saved it under. */
  outputIds: Map<string, string>
  /** Draft output keys whose thumbnail change was saved. */
  thumbnailsDone: Set<string>
  invited: Set<string>
}

export async function saveDraft(
  draft: Draft,
  /**
   * `visibility` is left out for a project a moderator took down: the API
   * refuses any change to it, the same value included.
   */
  target: { projectId?: string; visibility?: Visibility },
  projects: ProjectsApi
): Promise<SaveResult> {
  const failed: string[] = []
  const note = (what: string) => (e: Error) => {
    failed.push(`${what}: ${e.message}`)
    return undefined
  }
  const outputIds = new Map<string, string>()
  const thumbnailsDone = new Set<string>()
  const invited = new Set<string>()

  // 1. The project, as a private draft if it is new. Nothing else is worth
  // doing if this fails, so it is the one step allowed to throw.
  const content = contentPayload(draft)
  const projectId =
    target.projectId ?? (await projects.create({ ...content, visibility: 'PRIVATE' })).id

  // 2. New files: the outputs' and the gallery's.
  const uploaded = new Map<File, string>()
  const newFiles = [
    ...draft.outputs.flatMap((o) => (o.target.type === 'newFile' ? [o.target.file] : [])),
    ...draft.newFiles,
  ]
  for (const file of newFiles) {
    const saved = await projects.uploadFile(projectId, file).catch(note(file.name))
    if (saved) uploaded.set(file, saved.id)
  }

  // 3. The content, in one transaction on the API's side. On an edit this is
  // also where the text is written; a new project got it in step 1 already,
  // and sending it again is harmless.
  const outputs = outputsPayload(draft.outputs, uploaded)
  const saved = await projects
    .update(projectId, { ...content, outputs })
    .catch(note('Saving the project'))

  // 4. Thumbnails, matched to the saved outputs by position: the API stores
  // them in the order sent, and outputsPayload dropped only failed uploads.
  if (saved) {
    const kept = draft.outputs.filter(
      (o) => o.target.type !== 'newFile' || uploaded.has(o.target.file)
    )
    for (const [i, output] of kept.entries()) {
      const id = saved.outputs[i]?.id
      if (!id) continue
      outputIds.set(output.key, id)
      if (!output.thumbnail) continue
      const label = `Thumbnail for ${output.label || output.kind.toLowerCase()}`
      const done =
        output.thumbnail === 'remove'
          ? await projects.deleteThumbnail(projectId, id).catch(note(label))
          : await projects.uploadThumbnail(projectId, id, output.thumbnail).catch(note(label))
      if (done) thumbnailsDone.add(output.key)
    }
  }

  // 5. Invitations.
  for (const invite of draft.invites) {
    const sent = await projects.inviteCollaborator(projectId, invite.email).catch(note(invite.email))
    if (sent) invited.add(invite.email)
  }

  const result = { projectId, failed, uploaded, outputIds, thumbnailsDone, invited }

  // 6. Visibility last, and only when everything else is in place.
  if (failed.length > 0) return { ...result, visibilityApplied: false }
  const applied = await projects
    .update(projectId, {
      ...(target.visibility && { visibility: target.visibility }),
      showFrom: draft.showFrom || null,
    })
    .catch(note('Publishing'))
  return { ...result, visibilityApplied: !!applied }
}
