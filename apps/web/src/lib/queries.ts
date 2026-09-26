import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api, type ProjectSummary } from './api'
import { isCourseCode, postedAt } from './projectView'

/** The list endpoint's default page; a shorter page means there is no next one. */
export const PAGE_SIZE = 20

type ListParams = NonNullable<Parameters<typeof api.projects.list>[0]>

/**
 * A paged run of `/projects`. The endpoint returns an array rather than a
 * total, so "is there more" is read off whether the last page came back full.
 */
export function useProjectPages(params: Omit<ListParams, 'skip' | 'take'>, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: ['projects', params],
    queryFn: ({ pageParam }) => api.projects.list({ ...params, skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE_SIZE ? undefined : all.length * PAGE_SIZE),
    enabled,
  })
  return { ...query, projects: query.data?.pages.flat() ?? [] }
}

export type TagCount = { tag: string; count: number; course: boolean }

/**
 * The tags used most across a set of projects (a profile's own, for its
 * skills), optionally only those published since `since`. Case is folded for
 * counting and the first spelling seen is the one shown.
 */
export function countTags(
  projects: ProjectSummary[],
  opts: { since?: number; limit?: number } = {}
): TagCount[] {
  const counts = new Map<string, TagCount>()
  for (const p of projects) {
    if (opts.since && new Date(postedAt(p)).getTime() < opts.since) continue
    for (const raw of p.tags) {
      const course = isCourseCode(raw)
      const tag = course ? raw.trim().toUpperCase() : raw.trim()
      if (!tag) continue
      const key = tag.toLowerCase()
      const entry = counts.get(key) ?? { tag, count: 0, course }
      entry.count += 1
      counts.set(key, entry)
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, opts.limit ?? 5)
}

/** The course codes a student has published under, most used first. */
export function coursesOf(projects: ProjectSummary[]): string[] {
  const counts = new Map<string, number>()
  for (const p of projects) {
    if (p.courseCode) counts.set(p.courseCode, (counts.get(p.courseCode) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
}

/**
 * Site-wide counts — projects per faculty and course, this week's tags, how
 * many are asking for help. One cached request shared by every rail and tile.
 */
export function useFacets() {
  return useQuery({
    queryKey: ['facets'],
    queryFn: () => api.projects.facets(),
    staleTime: 5 * 60 * 1000,
  })
}

/** "38 projects", "1 project". */
export const countLabel = (n: number, noun = 'project') => `${n} ${noun}${n === 1 ? '' : 's'}`
