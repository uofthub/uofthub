import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api, isNotFound } from '../../lib/api'
import { handleOf } from '../../lib/paths'
import { Spinner } from '../../components/ui'
import NotFoundPage from '../info/NotFoundPage'
import ProfilePage from '../profile/ProfilePage'
import ProjectPage from '../project/ProjectPage'

/**
 * The readable addresses, /@handle and /@handle/slug. Each asks the API which
 * account or project it names, then shows that page by id — which moves the
 * address on to the current handle and slug if these are old ones.
 *
 * App.tsx routes every one-segment path it has no page for here, so anything
 * without the `@` is a plain "not found".
 */

// A 404 is an answer, not a blip worth three more tries.
const retry = (count: number, err: unknown) => !isNotFound(err) && count < 2

export function PersonRoute() {
  const handle = handleOf(useParams().handle)
  const { data, isLoading } = useQuery({
    queryKey: ['path', handle],
    queryFn: () => api.paths.person(handle!),
    enabled: !!handle,
    retry,
  })
  if (!handle) return <NotFoundPage />
  if (isLoading) return <Spinner />
  // Nobody by that handle: the profile page's own "No one here".
  return <ProfilePage id={data?.userId} />
}

export function ProjectRoute() {
  const params = useParams()
  const handle = handleOf(params.handle)
  const slug = params.slug
  const { data, isLoading } = useQuery({
    queryKey: ['path', handle, slug],
    queryFn: () => api.paths.project(handle!, slug!),
    enabled: !!handle && !!slug,
    retry,
  })
  if (!handle || !slug) return <NotFoundPage />
  if (isLoading) return <Spinner />
  // Nothing there the reader may see: the project page's own "isn't here".
  return <ProjectPage id={data?.projectId} />
}
