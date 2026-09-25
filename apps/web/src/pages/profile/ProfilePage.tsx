import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api, type ProfileUser } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort } from '../../lib/campus'
import { useDocumentTitle, useFollow } from '../../lib/hooks'
import { countTags, coursesOf } from '../../lib/queries'
import { WeekActivity } from '../../components/activity/WeekActivity'
import { ProjectCard, ProjectListRow } from '../../components/project'
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  Icon,
  Panel,
  Spinner,
  UnderlineTabs,
} from '../../components/ui'
import { AvatarEditor, EditProfileDialog } from './ProfileEditors'
import './profile.css'

/** The API's profile page size; a short page is the last. */
const PAGE = 24

type Section = 'projects' | 'collabs' | 'saved'

/** The navy banner with the gold dot field from the board. */
function Banner() {
  return (
    <div className="profile__banner" aria-hidden="true">
      <svg viewBox="0 0 1440 200" preserveAspectRatio="xMidYMid slice">
        <rect width="1440" height="200" fill="#1E3765" />
        {Array.from({ length: 22 }, (_, col) =>
          [40, 88, 136, 184].map((cy, row) => (
            <circle
              key={`${col}-${row}`}
              cx={60 + col * 64}
              cy={cy}
              r="3"
              fill="#F2C14E"
              opacity={[0.15, 0.35, 0.55][(col + row) % 3]}
            />
          ))
        )}
        <circle cx="1260" cy="100" r="140" fill="#2A4A80" />
      </svg>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="disp" style={{ fontSize: 24, fontWeight: 700 }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {label}
      </div>
    </div>
  )
}

/** Website, GitHub and LinkedIn, each only when set. */
function ProfileLinks({ profile }: { profile: ProfileUser }) {
  const links = [
    { href: profile.websiteUrl, label: 'Website', icon: 'globe' as const },
    { href: profile.githubUrl, label: 'GitHub', icon: 'code' as const },
    { href: profile.linkedinUrl, label: 'LinkedIn', icon: 'briefcase' as const },
  ].filter((l): l is typeof l & { href: string } => !!l.href)
  if (links.length === 0) return null
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      {links.map((l) => (
        <Button key={l.label} size="sm" icon={l.icon} href={l.href}>
          {l.label}
        </Button>
      ))}
    </div>
  )
}

/** The Profile board. */
export default function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user: me } = useAuth()
  const [editing, setEditing] = useState(false)
  const [section, setSection] = useState<Section>('projects')
  const follow = useFollow(id)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => api.users.get(id!),
    enabled: !!id,
  })
  const pages = useInfiniteQuery({
    queryKey: ['userProjects', id],
    queryFn: ({ pageParam }) => api.users.projects(id!, { skip: pageParam }),
    enabled: !!id,
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length * PAGE),
  })
  const collabs = useInfiniteQuery({
    queryKey: ['userCollaborations', id],
    queryFn: ({ pageParam }) => api.users.collaborations(id!, { skip: pageParam }),
    enabled: !!id && section === 'collabs',
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length * PAGE),
  })
  // Saves are private, so this tab only exists on your own profile.
  const saved = useInfiniteQuery({
    queryKey: ['saved'],
    queryFn: ({ pageParam }) => api.users.saved({ skip: pageParam }),
    enabled: !!me && me.id === id && section === 'saved',
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length * PAGE),
  })
  // Its own request: the list is newest-first and paged, so a project pinned a
  // year ago would not be on its first page.
  const { data: pinned = [] } = useQuery({
    queryKey: ['pinnedProjects', id],
    queryFn: () => api.users.pinned(id!),
    enabled: !!id,
  })
  useDocumentTitle(profile?.name)

  if (isLoading) return <Spinner />
  if (!profile) {
    return (
      <div className="page">
        <EmptyState icon="user" title="No one here" />
      </div>
    )
  }

  const own = me?.id === profile.id
  const projects = pages.data?.pages.flat() ?? []
  // A stale "saved" tab (signed out since) falls back to the projects tab.
  const tab: Section = section === 'saved' && !own ? 'projects' : section
  const active = tab === 'collabs' ? collabs : tab === 'saved' ? saved : pages
  const shown = tab === 'projects' ? projects : (active.data?.pages.flat() ?? [])
  const first = profile.name.split(/\s+/)[0]
  const maker = { id: profile.id, name: profile.name, avatarUrl: profile.avatarUrl }
  // Counted from what the page has loaded — every project on a first page of
  // 24, which is all of them for nearly everyone.
  const skills = countTags(projects, { limit: 10 }).filter((t) => !t.course)
  const courseCounts = coursesOf(projects).map((code) => ({
    code,
    n: projects.filter((p) => p.tags.some((t) => t.trim().toUpperCase() === code)).length,
  }))

  const line = [
    profile.program ?? profile.faculty,
    profile.program && profile.faculty && profile.faculty !== profile.program
      ? profile.faculty
      : undefined,
    profile.classYear && `Class of ${profile.classYear}`,
  ].filter(Boolean)

  return (
    <div className="profile">
      {editing && <EditProfileDialog onClose={() => setEditing(false)} />}
      <Banner />

      <div className="profile__head">
        {own ? (
          <AvatarEditor person={maker} size={144} />
        ) : (
          <Avatar person={maker} size={144} className="profile__avatar" />
        )}
        <div className="profile__who">
          <div className="row wrap" style={{ gap: 12 }}>
            <h1 className="disp profile__name">{profile.name}</h1>
            {/* Every account signed up with a U of T address; the API checks. */}
            <Chip size="sm" tone="navy" icon="shieldCheck" style={{ height: 26, fontWeight: 600 }}>
              U of T verified
            </Chip>
          </div>
          {(line.length > 0 || profile.campus) && (
            <div className="profile__line">
              {line.join(' · ')}
              {profile.campus && (
                <>
                  {line.length > 0 && ' · '}
                  <Icon name="mapPin" size={16} />
                  {campusShort(profile.campus)}
                </>
              )}
            </div>
          )}
        </div>
        <div className="profile__actions">
          {own ? (
            <Button icon="pen" onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          ) : (
            <>
              <Button icon="comment" to={me ? `/messages/${profile.id}` : '/session'}>
                Message
              </Button>
              {follow.canFollow && (
                <Button
                  variant={follow.following ? 'default' : 'primary'}
                  icon={follow.following ? 'check' : 'userPlus'}
                  onClick={follow.toggle}
                  disabled={follow.pending}
                >
                  {follow.following ? 'Following' : 'Follow'}
                </Button>
              )}
              {!me && (
                <Button variant="primary" icon="userPlus" to="/session">
                  Follow
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="profile__grid">
        <div className="stack" style={{ gap: 30, minWidth: 0 }}>
          {own && <WeekActivity />}
          <div className="stack" style={{ gap: 16 }}>
            {profile.bio ? (
              <p className="profile__bio">{profile.bio}</p>
            ) : (
              own && (
                <p className="muted" style={{ fontSize: 15 }}>
                  Add a line about what you build — it’s the first thing people read.{' '}
                  <button type="button" className="link-btn" onClick={() => setEditing(true)}>
                    Write a bio
                  </button>
                </p>
              )
            )}
            {(profile.openTo?.length ?? 0) > 0 && (
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="lbl" style={{ marginRight: 4 }}>
                  Open to
                </span>
                {profile.openTo!.map((o) => (
                  <Chip key={o} size="sm" tone="green">
                    {o}
                  </Chip>
                ))}
              </div>
            )}
            <ProfileLinks profile={profile} />
            <div className="profile__stats">
              <Stat value={profile._count.ownedProjects} label="Projects" />
              <Stat value={profile._count.collaborations} label="Collaborations" />
              <Stat value={profile._count.followers} label="Followers" />
              <Stat value={profile._count.following} label="Following" />
            </div>
          </div>

          {pinned.length > 0 && (
            <section className="stack" style={{ gap: 14 }}>
              <div className="row wrap" style={{ gap: 10 }}>
                <h2 className="h2">Pinned</h2>
                <span className="muted" style={{ fontSize: 14 }}>
                  {own
                    ? 'Your best work, chosen by you'
                    : `${first}’s best work, chosen by ${first}`}
                </span>
              </div>
              <div className="card-grid">
                {pinned.map((p) => (
                  <ProjectCard key={p.id} project={p} maker={maker} coverHeight={170} />
                ))}
              </div>
            </section>
          )}

          <section className="stack" style={{ gap: 14 }}>
            <UnderlineTabs<Section>
              label="Profile sections"
              value={tab}
              onChange={setSection}
              options={[
                { value: 'projects', label: `Projects ${profile._count.ownedProjects}` },
                { value: 'collabs', label: `Collaborations ${profile._count.collaborations}` },
                ...(own ? [{ value: 'saved' as const, label: 'Saved' }] : []),
              ]}
            />
            {own && pinned.length === 0 && projects.length > 0 && (
              <p className="muted row" style={{ gap: 6, fontSize: 14 }}>
                <Icon name="pin" size={16} /> Open a project and pin it from its More menu to lead
                with your best work.
              </p>
            )}
            {active.isLoading ? (
              <Spinner />
            ) : shown.length === 0 ? (
              tab === 'projects' ? (
                <EmptyState
                  icon="layers"
                  title={
                    own
                      ? 'You haven’t shared anything yet'
                      : `${first} hasn’t shared anything you can see yet`
                  }
                  action={
                    own && (
                      <Button variant="primary" icon="plus" to="/projects/new">
                        Post your first project
                      </Button>
                    )
                  }
                />
              ) : tab === 'collabs' ? (
                <EmptyState
                  icon="users"
                  title={
                    own
                      ? 'No collaborations yet'
                      : `${first} isn’t credited on anyone else’s work yet`
                  }
                >
                  {own && 'Projects you’re invited onto and accept show up here.'}
                </EmptyState>
              ) : (
                <EmptyState icon="bookmark" title="Nothing saved yet">
                  Tap the bookmark on any project to keep it here. Only you can see what you’ve
                  saved.
                </EmptyState>
              )
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                {shown.map((p) => (
                  <ProjectListRow
                    key={p.id}
                    project={p}
                    maker={tab === 'projects' ? maker : undefined}
                  />
                ))}
              </div>
            )}
            {active.hasNextPage && (
              <div className="row" style={{ justifyContent: 'center' }}>
                <Button onClick={() => active.fetchNextPage()} disabled={active.isFetchingNextPage}>
                  {active.isFetchingNextPage ? 'Loading…' : 'Show more'}
                </Button>
              </div>
            )}
          </section>
        </div>

        <aside className="stack" style={{ gap: 20 }}>
          {skills.length > 0 && (
            <Panel title="Skills from projects" gap={12} style={{ padding: '20px 22px' }}>
              <p className="muted" style={{ fontSize: 13 }}>
                Counted from tags on {own ? 'your' : `${first}’s`} own projects, not self-reported.
              </p>
              <div className="row wrap" style={{ gap: 6 }}>
                {skills.map((s) => (
                  <Chip key={s.tag} tone="outline" to={`/explore?q=${encodeURIComponent(s.tag)}`}>
                    {s.tag} <b style={{ color: 'var(--muted)', fontWeight: 600 }}>{s.count}</b>
                  </Chip>
                ))}
              </div>
            </Panel>
          )}
          {courseCounts.length > 0 && (
            <Panel title="Built for courses" gap={10} style={{ padding: '20px 22px' }}>
              {courseCounts.map((c) => (
                <Link
                  key={c.code}
                  to={`/explore?course=${encodeURIComponent(c.code)}`}
                  className="row"
                  style={{ justifyContent: 'space-between', fontSize: 15 }}
                >
                  <b style={{ fontWeight: 600 }}>{c.code}</b>
                  <span className="muted">
                    {c.n} project{c.n === 1 ? '' : 's'}
                  </span>
                </Link>
              ))}
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}
