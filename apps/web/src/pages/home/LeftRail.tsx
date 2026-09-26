import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Campus } from '@uofthub/types'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { CAMPUS_SHORT, CAMPUSES } from '../../lib/campus'
import { countLabel, coursesOf, useFacets } from '../../lib/queries'
import { Chip, Icon, type IconName } from '../../components/ui'
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
    <aside className="rail rail--left">
      <nav aria-label="Feed sections" className="stack" style={{ gap: 4 }}>
        {sections.map((s) => (
          <NavLink key={s.label} to={s.to} end className="rail-nav">
            <Icon name={s.icon} size={19} />
            {s.label}
            {!!s.badge && <span className="rail-badge">{s.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="stack" style={{ gap: 10 }}>
        <span className="lbl" style={{ padding: '0 12px' }}>
          Campus
        </span>
        <div className="row wrap" style={{ gap: 6, padding: '0 12px' }}>
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

      <div className="stack" style={{ gap: 4 }}>
        <span className="lbl" style={{ padding: '0 12px 6px' }}>
          Your courses
        </span>
        {courses.length > 0 ? (
          courses.map((code) => (
            <Link
              key={code}
              to={`/explore?course=${encodeURIComponent(code)}`}
              className="rail-course"
            >
              <b>{code}</b>
              {courseCount.has(code) && (
                <span className="muted">{countLabel(courseCount.get(code)!)}</span>
              )}
            </Link>
          ))
        ) : (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, padding: '0 12px' }}>
            Add the courses you take, or tag a project with its course code, and they show up here.
          </p>
        )}
        {user && (
          <button type="button" className="rail-add" onClick={() => setEditingCourses(true)}>
            {(user.courses?.length ?? 0) > 0 ? 'Edit your courses' : '+ Add a course'}
          </button>
        )}
      </div>
      {editingCourses && <CoursesDialog onClose={() => setEditingCourses(false)} />}
    </aside>
  )
}
