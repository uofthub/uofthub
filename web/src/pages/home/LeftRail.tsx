import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Campus } from '@uofthub/types'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { CAMPUS_SHORT, CAMPUSES } from '../../lib/campus'
import { countLabel, coursesOf, useFacets } from '../../lib/queries'
import { Chip, cx, Eyebrow, Icon, type IconName } from '../../components/ui'
import { Rail } from './Rail'
import { CoursesDialog } from './CoursesDialog'

type Section = { to: string; label: string; icon: IconName; badge?: number }

/**
 * The home feed's left column: sections, a campus filter, and the student's
 * courses.
 *
 * "Your courses" is the courses they added themselves, then any their own
 * projects are tagged with. The counts beside them are site-wide, from
 * /projects/facets.
 */
export function LeftRail({
  campus,
  onCampus,
}: {
  campus: Campus | ''
  onCampus: (c: Campus | '') => void
}) {
  const { user } = useAuth()
  const [editingCourses, setEditingCourses] = useState(false)
  const { data: facets } = useFacets()
  const { data: mine = [] } = useQuery({
    queryKey: ['userProjects', user?.id, 'first'],
    queryFn: () => api.users.projects(user!.id),
    enabled: !!user,
  })
  const courses = [...new Set([...(user?.courses ?? []), ...coursesOf(mine)])].slice(0, 6)
  const courseCount = new Map(facets?.courses.map((c) => [c.code, c.count]))

  const sections: Section[] = [
    { to: '/feed', label: 'Home', icon: 'home' },
    { to: '/explore', label: 'Explore', icon: 'compass' },
    { to: '/collections', label: 'Collections', icon: 'layers' },
    { to: '/help-wanted', label: 'Looking for help', icon: 'megaphone', badge: facets?.helpWanted },
    { to: '/saved', label: 'Saved', icon: 'bookmark' },
  ]

  return (
    <Rail className="hidden gap-7 lg:flex">
      <nav aria-label="Feed sections" className="flex flex-col gap-1">
        {sections.map((s) => (
          <NavLink
            key={s.label}
            to={s.to}
            end
            className={({ isActive }) =>
              cx(
                'flex h-11 items-center gap-3 rounded-btn border px-3 text-15 font-semibold',
                isActive
                  ? 'border-line bg-surface text-navy-ink hover:text-navy-ink'
                  : 'border-transparent text-ink-3 hover:bg-fill-soft hover:text-ink'
              )
            }
          >
            <Icon name={s.icon} size={19} />
            {s.label}
            {!!s.badge && (
              <span className="ml-auto rounded-full bg-navy px-2 py-0.5 text-12 font-bold text-white">
                {s.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-2.5">
        <Eyebrow as="span" className="px-3">
          Campus
        </Eyebrow>
        <div className="flex flex-wrap items-center gap-1.5 px-3">
          <Chip
            tone={campus === '' ? 'active' : 'default'}
            pressed={campus === ''}
            onClick={() => onCampus('')}
          >
            All
          </Chip>
          {CAMPUSES.map((c) => (
            <Chip
              key={c}
              tone={campus === c ? 'active' : 'default'}
              pressed={campus === c}
              onClick={() => onCampus(campus === c ? '' : c)}
            >
              {CAMPUS_SHORT[c]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Eyebrow as="span" className="px-3 pb-1.5">
          Your courses
        </Eyebrow>
        {courses.length > 0 ? (
          courses.map((code) => (
            <Link
              key={code}
              to={`/explore?course=${encodeURIComponent(code)}`}
              className="flex h-9 items-center justify-between rounded-lg px-3 text-14 text-ink hover:bg-fill-soft hover:text-ink"
            >
              <b className="font-semibold">{code}</b>
              {courseCount.has(code) && (
                <span className="text-13 text-muted">{countLabel(courseCount.get(code)!)}</span>
              )}
            </Link>
          ))
        ) : (
          <p className="px-3 text-13 leading-normal text-muted">
            Add the courses you take, or tag a project with its course code, and they show up here.
          </p>
        )}
        {user && (
          <button
            type="button"
            className="px-3 py-2 text-left text-14 font-semibold text-navy-ink hover:underline"
            onClick={() => setEditingCourses(true)}
          >
            {(user.courses?.length ?? 0) > 0 ? 'Edit your courses' : '+ Add a course'}
          </button>
        )}
      </div>
      {editingCourses && <CoursesDialog onClose={() => setEditingCourses(false)} />}
    </Rail>
  )
}
