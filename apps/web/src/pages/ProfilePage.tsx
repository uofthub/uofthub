import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api } from '../lib/api'
import { ProjectGrid } from '../components/ProjectCard'
import { CAMPUS_OPTIONS, campusLabel } from '../lib/campus'
import {
  Avatar,
  Btn,
  Card,
  Dialog,
  DialogTitle,
  EmptyState,
  ErrorText,
  Field,
  Icon,
  Menu,
  SelectField,
  Spinner,
  TextArea,
  TextField,
} from '../components/ui'

function AvatarEditor({ name, img, size, hasAvatar }: { name?: string; img?: string; size: number; hasAvatar: boolean }) {
  const { refetch } = useAuth()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const onChanged = () => {
    setError(null)
    refetch()
    qc.invalidateQueries({ queryKey: ['profile'] })
  }
  const upload = useMutation({
    mutationFn: (file: File) => api.users.uploadAvatar(file),
    onSuccess: onChanged,
    onError: (err: Error) => setError(err.message),
  })
  const remove = useMutation({
    mutationFn: () => api.users.deleteAvatar(),
    onSuccess: onChanged,
    onError: (err: Error) => setError(err.message),
  })
  const busy = upload.isPending || remove.isPending

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Avatar name={name} img={img} size={size} />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        disabled={busy}
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) upload.mutate(file)
        }}
      />

      <Menu
        activator={({ toggle }) => (
          <button
            onClick={toggle}
            aria-label="Change avatar"
            disabled={busy}
            className="pointer"
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'var(--v-accent-base)',
              border: '2px solid var(--v-component-base)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <Icon name="mdi-camera-outline" size={14} color="#fff" />
          </button>
        )}
      >
        {close => (
          <ul className="v-list" style={{ padding: '6px 0' }}>
            <li>
              <button
                className="v-list-item"
                onClick={() => {
                  close()
                  inputRef.current?.click()
                }}
              >
                <Icon name="mdi-upload-outline" color="var(--v-accent-base)" />
                {upload.isPending ? 'Uploading…' : 'Upload photo'}
              </button>
            </li>
            {hasAvatar && (
              <li>
                <button
                  className="v-list-item"
                  onClick={() => {
                    close()
                    remove.mutate()
                  }}
                >
                  <Icon name="mdi-delete-outline" color="var(--tone-error)" />
                  Remove photo
                </button>
              </li>
            )}
          </ul>
        )}
      </Menu>

      {error && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 200 }}>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  )
}

function EditProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, refetch } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: user?.name ?? '',
    faculty: user?.faculty ?? '',
    campus: user?.campus ?? '',
    program: user?.program ?? '',
    classYear: user?.classYear ? String(user.classYear) : '',
    bio: user?.bio ?? '',
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.users.updateMe({
        name: form.name,
        faculty: form.faculty || undefined,
        // Sent even when empty, so clearing it actually clears it — every
        // other field here treats empty as "leave alone".
        campus: form.campus,
        program: form.program || undefined,
        classYear: form.classYear ? Number(form.classYear) : undefined,
        bio: form.bio || undefined,
      }),
    onSuccess: () => {
      refetch()
      qc.invalidateQueries({ queryKey: ['profile', user?.id] })
      onClose()
    },
  })

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog onClose={onClose}>
      <DialogTitle onClose={onClose}>Edit profile</DialogTitle>
      <div style={{ padding: 22, display: 'grid', gap: 16 }}>
        <Field label="Name">
          <TextField value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Faculty">
          <TextField value={form.faculty} onChange={set('faculty')} placeholder="Arts & Science" />
        </Field>
        <Field label="Campus">
          <SelectField value={form.campus} onChange={set('campus')}>
            <option value="">Prefer not to say</option>
            {CAMPUS_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Program">
          <TextField value={form.program} onChange={set('program')} placeholder="Computer Science Specialist" />
        </Field>
        <Field label="Class year">
          <TextField type="number" value={form.classYear} onChange={set('classYear')} placeholder="2027" />
        </Field>
        <Field label="Bio">
          <TextArea rows={3} value={form.bio} onChange={set('bio')} placeholder="A sentence or two about you." />
        </Field>
        {mutation.isError && <ErrorText>{(mutation.error as Error).message}</ErrorText>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 22px 22px' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Btn>
      </div>
    </Dialog>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontSize: '1.5rem', fontWeight: 500 }}>{value}</div>
      <div className="text--disabled" style={{ fontSize: '0.8125rem' }}>
        {label}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => api.users.get(id!),
    enabled: !!id,
  })

  const {
    data: projectPages,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['userProjects', id],
    queryFn: ({ pageParam }) => api.users.projects(id!, { skip: pageParam }),
    enabled: !!id,
    initialPageParam: 0,
    // Matches the route's default page size: a short page is the last one.
    getNextPageParam: (last, all) => (last.length < 24 ? undefined : all.length * 24),
  })
  const projects = projectPages?.pages.flat() ?? []

  // Its own request rather than a flag on the list above: the list is paged
  // newest-first, so a project pinned a year ago would not be on the first
  // page, and a half-complete pinned strip is worse than none.
  const { data: pinned = [] } = useQuery({
    queryKey: ['pinnedProjects', id],
    queryFn: () => api.users.pinned(id!),
    enabled: !!id,
  })

  const { data: followState } = useQuery({
    queryKey: ['follow', id],
    queryFn: () => api.users.followingMe(id!),
    enabled: !!me && me.id !== id,
  })

  const followMutation = useMutation({
    mutationFn: () => api.users.follow(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow', id] })
      qc.invalidateQueries({ queryKey: ['profile', id] })
    },
  })

  usePageCrumbs([{ text: 'People', href: '/projects' }, { text: profile?.name ?? 'Profile' }])

  if (isLoading) return <Spinner />
  if (!profile) return <EmptyState icon="mdi-account-off-outline" title="Profile not found." />

  const isOwn = me?.id === id

  return (
    <div className="contentMaxWidth" style={{ paddingTop: 32, maxWidth: 960 }}>
      {editOpen && <EditProfileDialog onClose={() => setEditOpen(false)} />}

      <Card style={{ padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          {isOwn ? (
            <AvatarEditor name={profile.name} img={profile.avatarUrl} size={72} hasAvatar={!!profile.avatarUrl} />
          ) : (
            <Avatar name={profile.name} img={profile.avatarUrl} size={72} />
          )}
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <h1 style={{ fontSize: '1.5rem' }}>{profile.name}</h1>
            <div className="text--secondary" style={{ fontSize: '0.9375rem', marginTop: 4 }}>
              {[
                campusLabel(profile.campus),
                profile.faculty,
                profile.program,
                profile.classYear && `Class of ${profile.classYear}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>

          {isOwn ? (
            <Btn variant="outlined" onClick={() => setEditOpen(true)}>
              <Icon name="mdi-pencil-outline" size={18} />
              Edit profile
            </Btn>
          ) : (
            me && (
              <Btn
                variant={followState?.following ? 'outlined' : 'accent'}
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending}
              >
                <Icon name={followState?.following ? 'mdi-check' : 'mdi-plus'} size={18} color={followState?.following ? undefined : '#fff'} />
                {followState?.following ? 'Following' : 'Follow'}
              </Btn>
            )
          )}
        </div>

        {profile.bio && (
          <p className="text--secondary" style={{ marginTop: 20, marginBottom: 0 }}>
            {profile.bio}
          </p>
        )}

        <div style={{ display: 'flex', gap: 40, marginTop: 24 }}>
          <Stat value={profile._count.ownedProjects} label="projects" />
          <Stat value={profile._count.followers} label="followers" />
          <Stat value={profile._count.following} label="following" />
        </div>
      </Card>

      {/* Pinned first, and as cards — this is the one place on a profile
          where a card grid earns its space, because these six were chosen and
          the grid is what says so. Everything below is a list, which ranks. */}
      {pinned.length > 0 && (
        <>
          <h2 style={{ margin: '40px 0 16px' }}>Pinned</h2>
          <ProjectGrid projects={pinned} showOwner={false} />
        </>
      )}

      <h2 style={{ margin: '40px 0 16px' }}>{pinned.length > 0 ? 'All projects' : 'Projects'}</h2>

      {isOwn && pinned.length === 0 && projects.length > 0 && (
        <p className="text--disabled" style={{ fontSize: '0.875rem', marginTop: -8, marginBottom: 16 }}>
          <Icon name="mdi-pin-outline" size={16} /> Open a project and pin it to lead with your best work here.
        </p>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon="mdi-folder-open-outline"
          title={isOwn ? 'You have not shared anything yet.' : 'No public projects yet.'}
          action={
            isOwn && (
              <Btn variant="accent" to="/projects/new" style={{ marginTop: 16 }}>
                Share your first project
              </Btn>
            )
          }
        />
      ) : (
        <>
          <ProjectGrid projects={projects} showOwner={false} view="list" />
          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '28px 0' }}>
              <Btn variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Show more'}
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  )
}
