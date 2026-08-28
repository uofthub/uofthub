import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { usePageCrumbs } from '../lib/crumbs'
import { api } from '../lib/api'
import { ProjectGrid } from '../components/ProjectCard'
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
    program: user?.program ?? '',
    classYear: user?.classYear ? String(user.classYear) : '',
    bio: user?.bio ?? '',
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.users.updateMe({
        name: form.name,
        faculty: form.faculty || undefined,
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

  const { data: projects = [] } = useQuery({
    queryKey: ['userProjects', id],
    queryFn: () => api.users.projects(id!),
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
              {[profile.faculty, profile.program, profile.classYear && `Class of ${profile.classYear}`]
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

      <h2 style={{ margin: '40px 0 16px' }}>Projects</h2>
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
        <ProjectGrid projects={projects} showOwner={false} />
      )}
    </div>
  )
}
