import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useAuth } from './auth'

/** People matching an Explore search, above the projects. Signed in only. */
export function usePeopleSearch(q: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['people-search', q],
    queryFn: () => api.users.search(q, 6),
    enabled: !!user && q.trim().length > 1,
    staleTime: 60 * 1000,
  })
}

/** Who takes a course, or posted work in it. Signed in only. */
export function useCoursePeople(code: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['course-people', code.toUpperCase()],
    queryFn: () => api.courses.people(code),
    enabled: !!user && !!code,
    staleTime: 60 * 1000,
  })
}
