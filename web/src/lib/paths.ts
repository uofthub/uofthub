/**
 * Where a person or a project lives: uofthub.com/@handle and
 * uofthub.com/@handle/slug — see api/src/lib/handles.ts.
 *
 * Anything without the handle or slug to hand (a notification that only
 * carries an id) falls back to /u/:id or /projects/:id, which redirect to the
 * readable address once the page has loaded.
 */

type Person = { id: string; handle?: string | null }

type ProjectRef = {
  id: string
  slug?: string | null
  owner?: { handle?: string | null } | null
}

export const profilePath = (person: Person) =>
  person.handle ? `/@${person.handle}` : `/u/${person.id}`

export const projectPath = (project: ProjectRef) =>
  project.slug && project.owner?.handle
    ? `/@${project.owner.handle}/${project.slug}`
    : `/projects/${project.id}`

/** The address bar's path part is a person's: /@handle. */
export const handleOf = (segment: string | undefined) =>
  segment?.startsWith('@') && segment.length > 1 ? segment.slice(1) : null
