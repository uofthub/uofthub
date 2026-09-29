import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ProfileUser } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { campusShort, personLine } from '../../lib/campus'
import { useCanonicalPath, useDocumentTitle, useFollow } from '../../lib/hooks'
import { profilePath } from '../../lib/paths'
import { countTags, coursesOf } from '../../lib/queries'
import { WeekActivity } from '../../components/activity/WeekActivity'
import { ProjectCard, ProjectListRow, ReportDialog } from '../../components/project'
import {
  Avatar,
  Button,
  CardGrid,
  Chip,
  Dialog,
  EmptyState,
  Eyebrow,
  Heading,
  Icon,
  LinkButton,
  LoadMore,
  Menu,
  MenuItem,
  Page,
  Panel,
  Spinner,
  Stat,
  UnderlineTabs,
  confirmAction,
  toast,
} from '../../components/ui'
import { AvatarEditor, EditProfileDialog, profileAvatar } from './ProfileEditors'

/** The API's profile page size; a short page is the last. */
const PAGE = 24

type Section = 'projects' | 'collabs' | 'saved'

/** The navy banner with the gold dot field from the board. */
function Banner() {
  return (
    <div className="h-30 md:h-47.5" aria-hidden="true">
      <svg viewBox="0 0 1440 200" preserveAspectRatio="xMidYMid slice" className="size-full">
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

/** Website, GitHub and LinkedIn, each only when set. */
function ProfileLinks({ profile }: { profile: ProfileUser }) {
  const links = [
    { href: profile.websiteUrl, label: 'Website', icon: 'globe' as const },
    { href: profile.githubUrl, label: 'GitHub', icon: 'code' as const },
    { href: profile.linkedinUrl, label: 'LinkedIn', icon: 'briefcase' as const },
  ].filter((l): l is typeof l & { href: string } => !!l.href)
  if (links.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((l) => (
        <Button key={l.label} size="sm" icon={l.icon} href={l.href}>
          {l.label}
        </Button>
      ))}
    </div>
  )
}

/** Report and block, for somebody else's profile. */
function ProfileMenu({ profile, onReport }: { profile: ProfileUser; onReport: () => void }) {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['profile', profile.id] })
    qc.invalidateQueries({ queryKey: ['following'] })
  }
  const toggle = useMutation({
    mutationFn: () =>
      profile.blockedByMe ? api.messages.unblock(profile.id) : api.messages.block(profile.id),
    onSuccess: () => {
      refresh()
      if (profile.blockedByMe) return toast(`Unblocked ${profile.name}.`)
      // Undo goes straight to unblock: the profile may not have refetched yet.
      toast(`Blocked ${profile.name}.`, {
        action: {
          label: 'Undo',
          onClick: () =>
            api.messages
              .unblock(profile.id)
              .then(refresh, () => toast.error('Couldn’t unblock. Try again.')),
        },
      })
    },
  })
  return (
    <Menu
      width={230}
      trigger={({ toggle: open, open: isOpen }) => (
        <Button iconOnly icon="more" aria-label="More" aria-expanded={isOpen} onClick={open} />
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon="lock"
            onSelect={async () =>
              (profile.blockedByMe ||
                (await confirmAction({
                  title: `Block ${profile.name}?`,
                  body: 'Neither of you will be able to message, comment on, react to or follow the other. They won’t be told.',
                  confirmLabel: 'Block',
                  danger: true,
                }))) &&
              toggle.mutate()
            }
            close={close}
          >
            {profile.blockedByMe ? 'Unblock' : 'Block'}
          </MenuItem>
          <MenuItem icon="flag" onSelect={onReport} close={close}>
            Report profile
          </MenuItem>
        </>
      )}
    </Menu>
  )
}

/** Who follows someone, or who they follow. */
function FollowListDialog({
  userId,
  direction,
  onClose,
}: {
  userId: string
  direction: 'followers' | 'following'
  onClose: () => void
}) {
  const list = useInfiniteQuery({
    queryKey: [direction, userId],
    queryFn: ({ pageParam }) =>
      direction === 'followers'
        ? api.users.followers(userId, pageParam)
        : api.users.following(userId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < 30 ? undefined : all.length * 30),
  })
  const people = list.data?.pages.flat() ?? []
  return (
    <Dialog
      title={direction === 'followers' ? 'Followers' : 'Following'}
      onClose={onClose}
      width={440}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {list.isLoading ? (
        <Spinner />
      ) : people.length === 0 ? (
        <p className="text-15 text-muted">Nobody yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {people.map((p) => (
            <li key={p.id}>
              <Link
                to={profilePath(p)}
                onClick={onClose}
                className="flex items-center gap-3 text-ink"
              >
                <Avatar person={p} size={36} />
                <span className="flex min-w-0 flex-col">
                  <b className="text-15 font-semibold">{p.name}</b>
                  {personLine(p) && <span className="text-13 text-muted">{personLine(p)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && <LoadMore query={list} />}
    </Dialog>
  )
}

/** The Profile board. */
/** A profile, by `id` — given by the /@handle route, or from /u/:id. */
export default function ProfilePage({ id: resolved }: { id?: string }) {
  const params = useParams<{ id: string }>()
  const id = resolved ?? params.id
  const { user: me } = useAuth()
  const [editing, setEditing] = useState(false)
  const [section, setSection] = useState<Section>('projects')
  const [people, setPeople] = useState<'followers' | 'following' | null>(null)
  const [reporting, setReporting] = useState(false)
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
  useCanonicalPath(profile && profilePath(profile))

  if (isLoading) return <Spinner />
  if (!profile) {
    return (
      <Page>
        <EmptyState icon="user" title="No one here" />
      </Page>
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
  // Courses they have published in, counted by what each project was filed
  // under; then the ones they say they take and have nothing in yet.
  const courseCounts = coursesOf(projects).map((code) => ({
    code,
    n: projects.filter((p) => p.courseCode === code).length,
  }))
  const taking = (profile.courses ?? []).filter((c) => !courseCounts.some((x) => x.code === c))

  const line = [
    profile.program ?? profile.faculty,
    profile.program && profile.faculty && profile.faculty !== profile.program
      ? profile.faculty
      : undefined,
    profile.classYear && `Class of ${profile.classYear}`,
  ].filter(Boolean)

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      {editing && <EditProfileDialog onClose={() => setEditing(false)} />}
      {people && (
        <FollowListDialog userId={profile.id} direction={people} onClose={() => setPeople(null)} />
      )}
      {reporting && (
        <ReportDialog
          target={{ kind: 'user', userId: profile.id }}
          onClose={() => setReporting(false)}
        />
      )}
      <Banner />

      <div className="-mt-12 flex flex-col items-start gap-3 px-4 md:-mt-16 md:flex-row md:items-end md:gap-7 md:px-6 xl:px-16">
        {own ? (
          <AvatarEditor person={maker} size={144} />
        ) : (
          <Avatar person={maker} size={144} className={profileAvatar} />
        )}
        <div className="flex min-w-0 grow flex-col gap-1.5 pb-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-30 leading-[1.1] font-bold tracking-tightest md:text-40">
              {profile.name}
            </h1>
            {/* Every account signed up with a U of T address; the API checks.
                Which address — @utoronto.ca or @mail.utoronto.ca — is what
                tells faculty from students, and nobody can set it: a student
                who names themselves after a professor still reads as one. */}
            <span
              title={
                profile.isFaculty
                  ? 'Signed up with a @utoronto.ca address'
                  : 'Signed up with a U of T student address'
              }
            >
              <Chip size="sm" tone="navy" icon="shieldCheck" className="h-6.5 font-semibold">
                {profile.isFaculty ? 'U of T faculty & staff' : 'U of T verified'}
              </Chip>
            </span>
          </div>
          <div className="text-15 text-muted">@{profile.handle}</div>
          {(line.length > 0 || profile.campus) && (
            <div className="flex flex-wrap items-center gap-1.5 text-16 text-ink-3">
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
        <div className="flex gap-2.5 pb-2.5">
          {own ? (
            <Button icon="pen" onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          ) : (
            <>
              {/* Hidden when they aren't taking new messages, or you blocked
                  them. A conversation you already have stays in Messages. */}
              {(profile.allowMessages !== false || !me) && !profile.blockedByMe && (
                <Button icon="comment" to={me ? `/messages/${profile.id}` : '/session'}>
                  Message
                </Button>
              )}
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
              {me && <ProfileMenu profile={profile} onReport={() => setReporting(true)} />}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 px-3 pt-5 pb-8 md:gap-10 md:px-6 md:pt-6 md:pb-12 xl:grid-cols-[minmax(0,1fr)_360px] xl:px-16 xl:pt-7">
        <div className="flex min-w-0 flex-col gap-7.5">
          {own && <WeekActivity />}
          <div className="flex flex-col gap-4">
            {profile.bio ? (
              <p className="max-w-180 text-17 leading-[1.6]">{profile.bio}</p>
            ) : (
              own && (
                <p className="text-15 text-muted">
                  Add a line about what you build — it’s the first thing people read.{' '}
                  <LinkButton onClick={() => setEditing(true)}>Write a bio</LinkButton>
                </p>
              )
            )}
            {(profile.openTo?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Eyebrow as="span" className="mr-1">
                  Open to
                </Eyebrow>
                {profile.openTo!.map((o) => (
                  <Chip key={o} size="sm" tone="green">
                    {o}
                  </Chip>
                ))}
              </div>
            )}
            <ProfileLinks profile={profile} />
            <div className="flex gap-7 border-y border-line py-4 md:gap-10">
              <Stat value={profile._count.ownedProjects} label="Projects" />
              <Stat value={profile._count.collaborations} label="Collaborations" />
              <Stat
                value={profile._count.followers}
                label="Followers"
                onClick={() => setPeople('followers')}
              />
              <Stat
                value={profile._count.following}
                label="Following"
                onClick={() => setPeople('following')}
              />
            </div>
          </div>

          {pinned.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <Heading>Pinned</Heading>
                <span className="text-14 text-muted">
                  {own
                    ? 'Your best work, chosen by you'
                    : `${first}’s best work, chosen by ${first}`}
                </span>
              </div>
              <CardGrid>
                {pinned.map((p) => (
                  <ProjectCard key={p.id} project={p} maker={maker} coverHeight={170} />
                ))}
              </CardGrid>
            </section>
          )}

          <section className="flex flex-col gap-3.5">
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
              <p className="flex items-center gap-1.5 text-14 text-muted">
                <Icon name="pin" size={16} /> Open a project and pin it from its More menu to lead
                with your best work.
              </p>
            )}
            <div key={tab} className="motion-safe:animate-tab-in">
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
                <div className="flex flex-col gap-3.5">
                  {shown.map((p) => (
                    <ProjectListRow
                      key={p.id}
                      project={p}
                      maker={tab === 'projects' ? maker : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
            {active.hasNextPage && <LoadMore query={active} />}
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          {skills.length > 0 && (
            <Panel title="Skills from projects" className="gap-3 px-5.5 py-5">
              <p className="text-13 text-muted">
                Counted from tags on {own ? 'your' : `${first}’s`} own projects, not self-reported.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {skills.map((s) => (
                  <Chip key={s.tag} tone="outline" to={`/explore?q=${encodeURIComponent(s.tag)}`}>
                    {s.tag} <b className="font-semibold text-muted">{s.count}</b>
                  </Chip>
                ))}
              </div>
            </Panel>
          )}
          {(courseCounts.length > 0 || taking.length > 0) && (
            <Panel title="Courses" className="gap-2.5 px-5.5 py-5">
              {courseCounts.map((c) => (
                <Link
                  key={c.code}
                  to={`/explore?course=${encodeURIComponent(c.code)}`}
                  className="flex items-center justify-between text-15"
                >
                  <b className="font-semibold">{c.code}</b>
                  <span className="text-muted">
                    {c.n} project{c.n === 1 ? '' : 's'}
                  </span>
                </Link>
              ))}
              {taking.map((code) => (
                <Link
                  key={code}
                  to={`/explore?course=${encodeURIComponent(code)}`}
                  className="flex items-center justify-between text-15"
                >
                  <b className="font-semibold">{code}</b>
                  <span className="text-muted">Taking</span>
                </Link>
              ))}
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}
