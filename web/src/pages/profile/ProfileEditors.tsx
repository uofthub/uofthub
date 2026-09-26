import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { CAMPUS_OPTIONS } from '../../lib/campus'
import { FACULTIES } from '../../lib/faculties'
import {
  Avatar,
  Button,
  ChipInput,
  Dialog,
  ErrorText,
  Field,
  FieldRow,
  Input,
  Menu,
  MenuItem,
  Select,
  TextArea,
  Toggle,
} from '../../components/ui'

/**
 * The profile's big avatar: ringed in the page colour so it reads as sitting
 * on the banner's edge, and smaller on a phone. The sizes beat the inline ones
 * Avatar sets, hence the !.
 */
export const profileAvatar = 'border-5 border-page max-md:size-24! max-md:text-36! md:text-54!'

/** The profile's big avatar, with a camera button for its owner. */
export function AvatarEditor({
  person,
  size,
}: {
  person: { id: string; name: string; avatarUrl?: string }
  size: number
}) {
  const { refetch } = useAuth()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const changed = () => {
    setError(null)
    refetch()
    qc.invalidateQueries({ queryKey: ['profile'] })
  }
  const upload = useMutation({
    mutationFn: (f: File) => api.users.uploadAvatar(f),
    onSuccess: changed,
    onError: (e: Error) => setError(e.message),
  })
  const remove = useMutation({
    mutationFn: () => api.users.deleteAvatar(),
    onSuccess: changed,
    onError: (e: Error) => setError(e.message),
  })
  const busy = upload.isPending || remove.isPending

  return (
    <div className="relative shrink-0">
      <Avatar person={person} size={size} className={profileAvatar} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) upload.mutate(f)
        }}
      />
      <span className="absolute right-1.5 bottom-1.5">
        <Menu
          align="left"
          width={200}
          trigger={({ toggle }) => (
            <Button
              size="md"
              iconOnly
              variant="primary"
              icon="camera"
              aria-label="Change photo"
              onClick={toggle}
              disabled={busy}
            />
          )}
        >
          {(close) => (
            <>
              <MenuItem icon="upload" onSelect={() => input.current?.click()} close={close}>
                {upload.isPending ? 'Uploading…' : 'Upload photo'}
              </MenuItem>
              {person.avatarUrl && (
                <MenuItem icon="trash" danger onSelect={() => remove.mutate()} close={close}>
                  Remove photo
                </MenuItem>
              )}
            </>
          )}
        </Menu>
      </span>
      {error && (
        <div className="absolute top-full left-0 mt-1.5 w-60">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  )
}

export function EditProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, refetch } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: user?.name ?? '',
    faculty: user?.faculty ?? '',
    campus: user?.campus ?? '',
    program: user?.program ?? '',
    classYear: user?.classYear ? String(user.classYear) : '',
    bio: user?.bio ?? '',
    websiteUrl: user?.websiteUrl ?? '',
    githubUrl: user?.githubUrl ?? '',
    linkedinUrl: user?.linkedinUrl ?? '',
  })
  const [openTo, setOpenTo] = useState<string[]>(user?.openTo ?? [])
  const [allowMessages, setAllowMessages] = useState(user?.allowMessages ?? true)
  const legacyFaculty =
    user?.faculty && !FACULTIES.some((f) => f.name === user.faculty) ? user.faculty : null
  const save = useMutation({
    mutationFn: () =>
      api.users.updateMe({
        name: form.name,
        faculty: form.faculty,
        // Sent even when empty, so clearing it actually clears it.
        campus: form.campus,
        program: form.program || undefined,
        classYear: form.classYear ? Number(form.classYear) : undefined,
        bio: form.bio || undefined,
        openTo,
        allowMessages,
        // Empty clears a link.
        websiteUrl: form.websiteUrl.trim() || null,
        githubUrl: form.githubUrl.trim() || null,
        linkedinUrl: form.linkedinUrl.trim() || null,
      }),
    onSuccess: () => {
      refetch()
      qc.invalidateQueries({ queryKey: ['profile', user?.id] })
      onClose()
    },
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog
      title="Edit profile"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={!form.name.trim() || save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Faculty" hint="Explore’s faculty tiles and “Your program” match on this.">
        <Select value={form.faculty} onChange={set('faculty')}>
          <option value="">Prefer not to say</option>
          {FACULTIES.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
          {/* Written before the list existed: kept until changed. */}
          {legacyFaculty && <option value={legacyFaculty}>{legacyFaculty}</option>}
        </Select>
      </Field>
      <FieldRow>
        <Field label="Program">
          <Input value={form.program} onChange={set('program')} placeholder="Engineering Science" />
        </Field>
        <Field label="Graduating">
          <Input
            type="number"
            value={form.classYear}
            onChange={set('classYear')}
            placeholder="2027"
          />
        </Field>
      </FieldRow>
      <Field label="Campus">
        <Select value={form.campus} onChange={set('campus')}>
          <option value="">Prefer not to say</option>
          {CAMPUS_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Bio">
        <TextArea
          rows={3}
          value={form.bio}
          onChange={set('bio')}
          placeholder="What you build, and what you’re up for."
        />
      </Field>
      <Field label="Open to" hint="Up to six, shown on your profile. Press Enter after each.">
        <ChipInput
          id="open-to"
          label="Open to"
          value={openTo}
          onChange={setOpenTo}
          max={6}
          maxLength={40}
          placeholder="Collaboration, Summer 2027 internships…"
        />
      </Field>
      <Field label="Website">
        <Input
          type="url"
          value={form.websiteUrl}
          onChange={set('websiteUrl')}
          placeholder="https://"
        />
      </Field>
      <FieldRow>
        <Field label="GitHub">
          <Input
            type="url"
            value={form.githubUrl}
            onChange={set('githubUrl')}
            placeholder="https://github.com/you"
          />
        </Field>
        <Field label="LinkedIn">
          <Input
            type="url"
            value={form.linkedinUrl}
            onChange={set('linkedinUrl')}
            placeholder="https://linkedin.com/in/you"
          />
        </Field>
      </FieldRow>
      <Toggle checked={allowMessages} onChange={setAllowMessages}>
        Let other students message me
      </Toggle>
      <p className="-mt-1.5 text-13 text-muted">
        Turning this off stops new conversations. People you’ve written to can still reply.
      </p>
      {save.isError && <ErrorText>{(save.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
