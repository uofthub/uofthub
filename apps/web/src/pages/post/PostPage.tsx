import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProjectStatus, Visibility } from '@uofthub/types'
import { api, type ImportedLink } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatBytes } from '../../lib/files'
import { useDocumentTitle } from '../../lib/hooks'
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_KEYS,
  PROJECT_TYPES,
  PROJECT_TYPE_KEYS,
  type ProjectType,
} from '../../lib/projectMeta'
import { isCourseCode } from '../../lib/projectView'
import { Cover } from '../../components/project'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorText,
  Field,
  Icon,
  Input,
  Pill,
  TextArea,
  type IconName,
} from '../../components/ui'
import {
  composeDescription,
  composeDetails,
  composeLinks,
  placeLinks,
  typeForUrl,
  TYPE_FORMS,
} from './compose'
import { TagInput } from './TagInput'
import './post.css'

const PITCH_MAX = 120
const FILE_MAX = 8

type Invite = { email: string; role: string }

const VISIBILITY: {
  value: Visibility
  label: string
  hint: string
  icon: IconName
}[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    hint: 'Anyone on the web, and search engines',
    icon: 'globe',
  },
  {
    value: 'UOFT',
    label: 'U of T only',
    hint: 'Signed-in students and staff. Good for class work.',
    icon: 'lock',
  },
  { value: 'UNLISTED', label: 'Unlisted', hint: 'Only people with the link', icon: 'link' },
]

function Stepper({ done }: { done: boolean[] }) {
  const steps = ['What it is', 'Details', 'People', 'Visibility']
  const current = done.findIndex((d) => !d)
  return (
    <ol className="stepper">
      {steps.map((label, i) => {
        const state = done[i] ? 'done' : i === current ? 'now' : 'next'
        return (
          <li key={label} className={`stepper__step stepper__step--${state}`}>
            <span className="stepper__dot">
              {done[i] ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className="stepper__label">{label}</span>
            {i < steps.length - 1 && <span className="stepper__rule" />}
          </li>
        )
      })}
    </ol>
  )
}

/** The Post a project board. */
export default function PostPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  useDocumentTitle('Post a project')

  const [params] = useSearchParams()
  const [type, setType] = useState<ProjectType>('APP')
  // "Looking for…" on the home composer opens this form already asking for help.
  const [status, setStatus] = useState<ProjectStatus | null>(
    params.get('status') === 'HELP_WANTED' ? 'HELP_WANTED' : 'IN_PROGRESS'
  )
  const [title, setTitle] = useState('')
  const [pitch, setPitch] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [course, setCourse] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [invite, setInvite] = useState<Invite>({ email: '', role: '' })
  const [visibility, setVisibility] = useState<Visibility>('UOFT')
  const [problem, setProblem] = useState<{ message: string; projectId?: string } | null>(null)
  // "Start from a link": the pasted URL, and what came back that has no
  // field of its own — a README for the story, links with no slot.
  const [importUrl, setImportUrl] = useState('')
  const [about, setAbout] = useState('')
  const [extraLinks, setExtraLinks] = useState<{ label: string; url: string }[]>([])

  // The first picked image stands in as the cover, as it will once uploaded.
  const firstImage = files.find((f) => f.type.startsWith('image/'))
  const previewCover = useMemo(
    () => (firstImage ? URL.createObjectURL(firstImage) : undefined),
    [firstImage]
  )
  useEffect(
    () => () => {
      if (previewCover) URL.revokeObjectURL(previewCover)
    },
    [previewCover]
  )

  const form = TYPE_FORMS[type]
  const meta = PROJECT_TYPES[type]
  const courseCode = course.trim().toUpperCase()
  const courseOk = !courseCode || isCourseCode(courseCode)

  const importLink = useMutation({
    mutationFn: (url: string) => api.projects.importLink(url),
    onSuccess: (got: ImportedLink) => {
      const nextType = got.type ?? typeForUrl(got.url) ?? type
      setType(nextType)
      if (got.title) setTitle(got.title.slice(0, 120))
      if (got.pitch)
        setPitch(
          got.pitch.length > PITCH_MAX
            ? `${got.pitch.slice(0, PITCH_MAX - 1).trimEnd()}…`
            : got.pitch
        )
      if (got.description) setAbout(got.description)
      if (got.tags.length)
        setTags((t) => [...new Set([...t, ...got.tags.map((x) => x.toLowerCase())])])
      const placed = placeLinks(nextType, got.links)
      setAnswers((a) => ({ ...a, ...placed.answers }))
      setExtraLinks(placed.rest)
      if (got.image) {
        const bytes = Uint8Array.from(atob(got.image.dataBase64), (c) => c.charCodeAt(0))
        const cover = new File([bytes], got.image.name, { type: got.image.contentType })
        // First, so it becomes the cover.
        setFiles((f) => [cover, ...f.filter((x) => x.name !== cover.name)].slice(0, FILE_MAX))
      }
    },
  })

  const publish = useMutation({
    mutationFn: async (as: Visibility) => {
      const allTags = [
        ...(courseCode ? [courseCode] : []),
        ...tags.filter((t) => t.toUpperCase() !== courseCode),
      ]
      const project = await api.projects.create({
        title: title.trim(),
        pitch: pitch.trim() || null,
        description:
          [composeDescription(type, answers), about.trim()].filter(Boolean).join('\n\n') ||
          undefined,
        details: composeDetails(type, answers),
        type,
        status,
        tags: allTags,
        visibility: as,
        links: [
          ...composeLinks(type, answers),
          ...extraLinks.filter((l) => !Object.values(answers).includes(l.url)),
        ],
      })
      // The project exists from here on, so anything that fails below is
      // reported against it rather than as a failed publish.
      const failed: string[] = []
      for (const file of files) {
        await api.projects
          .uploadFile(project.id, file)
          .catch((e: Error) => failed.push(`${file.name}: ${e.message}`))
      }
      for (const inv of invites) {
        await api.projects
          .inviteCollaborator(project.id, inv.email)
          .catch((e: Error) => failed.push(`${inv.email}: ${e.message}`))
      }
      return { project, failed }
    },
    onSuccess: ({ project, failed }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['userProjects'] })
      if (failed.length)
        setProblem({
          message: `Posted, but some things didn’t go through — ${failed.join('; ')}`,
          projectId: project.id,
        })
      else navigate(`/projects/${project.id}`)
    },
    onError: (e: Error) => setProblem({ message: e.message }),
  })

  if (!user) {
    return (
      <div className="page">
        <EmptyState
          icon="lock"
          title="Sign in to share your work"
          action={
            <Button variant="primary" to="/session">
              Sign in with your U of T email
            </Button>
          }
        />
      </div>
    )
  }

  const addInvite = () => {
    const email = invite.email.trim().toLowerCase()
    if (!email || invites.some((i) => i.email === email)) return
    setInvites((list) => [...list, { email, role: invite.role.trim() }])
    setInvite({ email: '', role: '' })
  }

  const ready = !!title.trim() && courseOk
  const done = [true, !!title.trim() && !!pitch.trim(), invites.length > 0, false]

  return (
    <div className="page page--wide post-grid">
      <div className="stack" style={{ gap: 22, minWidth: 0 }}>
        <div>
          <h1 className="page-title">Share your work</h1>
          <p className="page-lede">
            Takes about two minutes. Unfinished is fine, and you can save a draft anytime.
          </p>
        </div>

        <Stepper done={done} />

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            What are you sharing?
          </h2>
          <div className="type-grid">
            {PROJECT_TYPE_KEYS.map((k) => {
              const t = PROJECT_TYPES[k]
              const on = k === type
              return (
                <button
                  key={k}
                  type="button"
                  className={on ? 'type-tile type-tile--on' : 'type-tile'}
                  aria-pressed={on}
                  onClick={() => setType(k)}
                >
                  {on && (
                    <span className="type-tile__check">
                      <Icon name="check" size={13} />
                    </span>
                  )}
                  <span style={{ color: 'var(--navy-ink)' }}>
                    <Icon name={t.icon} size={22} />
                  </span>
                  <span>
                    <span className="type-tile__label">{t.label}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {t.hint}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            The form below only asks for what fits this type.
          </p>
        </section>

        <section className="card post-card" style={{ gap: 12 }}>
          <h2 className="h2" style={{ fontSize: 20 }}>
            Start from a link{' '}
            <span
              className="muted"
              style={{ fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-body)' }}
            >
              · optional
            </span>
          </h2>
          <form
            className="row"
            style={{ gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (importUrl.trim()) importLink.mutate(importUrl.trim())
            }}
          >
            <label className="grow">
              <span className="sr-only">Link to import</span>
              <Input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="Paste a GitHub, YouTube, Figma, Drive or SoundCloud link"
              />
            </label>
            <Button type="submit" icon="link" disabled={!importUrl.trim() || importLink.isPending}>
              {importLink.isPending ? 'Importing…' : 'Import'}
            </Button>
          </form>
          {importLink.isError ? (
            <ErrorText>{(importLink.error as Error).message}</ErrorText>
          ) : importLink.isSuccess ? (
            <p className="row" style={{ gap: 6, fontSize: 13, color: 'var(--green)' }}>
              <Icon name="check" size={15} /> Filled in from the link — check it over below.
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              We’ll fill in the title, cover image and description for you to edit.
            </p>
          )}
        </section>

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            Details
          </h2>
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give it a short, specific name"
              maxLength={120}
            />
          </Field>
          <Field
            label="One-line pitch"
            hint={`Up to ${PITCH_MAX} characters. This is what shows on cards.`}
          >
            <Input
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              placeholder="What is it, in one sentence?"
              maxLength={PITCH_MAX}
            />
          </Field>

          <div className="post-fields">
            {form.fields.map((f) => (
              <Field
                key={`${type}-${f.key}`}
                label={f.label}
                hint={f.hint}
                className={f.half ? 'post-fields__half' : undefined}
              >
                {f.multiline ? (
                  <TextArea
                    rows={4}
                    placeholder={f.placeholder}
                    value={answers[f.key] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    placeholder={f.placeholder}
                    value={answers[f.key] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
          </div>

          {about && (
            <Field
              label="About"
              hint="Imported from the link — Markdown works. It becomes the project’s overview."
            >
              <TextArea rows={8} value={about} onChange={(e) => setAbout(e.target.value)} />
            </Field>
          )}

          <label className="dropzone">
            <span className="dropzone__icon">
              <Icon name="upload" size={20} />
            </span>
            <span className="grow">
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>
                {form.drop.title}
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                {form.drop.hint}
              </span>
            </span>
            <span className="btn btn--md">Browse files</span>
            <input
              type="file"
              multiple
              accept={form.drop.accept}
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                e.target.value = ''
                setFiles((list) => [...list, ...picked].slice(0, FILE_MAX))
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="stack" style={{ gap: 6, listStyle: 'none', padding: 0 }}>
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="row" style={{ gap: 8, fontSize: 14 }}>
                  <Icon name="file" size={16} />
                  <span className="grow clamp-1">{f.name}</span>
                  <span className="muted">{formatBytes(f.size)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon="close"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="post-fields">
            <Field
              label="Built for a course?"
              hint={
                courseOk
                  ? 'Adds it to that course’s page'
                  : 'That doesn’t look like a course code — try CSC309'
              }
              className="post-fields__half"
            >
              <Input
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g. CSC309"
              />
            </Field>
            <Field
              label="Tags"
              hint="Tags become the skills on your profile"
              className="post-fields__half"
            >
              <TagInput value={tags} onChange={setTags} />
            </Field>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Status</span>
            <div className="row wrap" style={{ gap: 8 }}>
              {PROJECT_STATUS_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={status === k ? 'pill pill--on' : 'pill'}
                  aria-pressed={status === k}
                  onClick={() => setStatus(status === k ? null : k)}
                >
                  <i style={{ background: PROJECT_STATUSES[k].dot }} />
                  {PROJECT_STATUSES[k].label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card post-card" style={{ gap: 14 }}>
          <h2 className="h2" style={{ fontSize: 20 }}>
            People
          </h2>
          <form
            className="row wrap"
            style={{ gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault()
              addInvite()
            }}
          >
            <label className="grow" style={{ flexBasis: 240 }}>
              <span className="sr-only">Collaborator email</span>
              <Input
                type="email"
                value={invite.email}
                onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
                placeholder="name@mail.utoronto.ca"
              />
            </label>
            <Input
              value={invite.role}
              onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}
              placeholder="Their role"
              aria-label="Their role"
              style={{ width: 200 }}
            />
            <Button type="submit" icon="userPlus" disabled={!invite.email.trim()}>
              Invite
            </Button>
          </form>
          {invites.map((inv) => (
            <div key={inv.email} className="invite-row">
              <Avatar
                person={{ id: inv.email, name: inv.email.split('@')[0].replace(/[._]/g, ' ') }}
                size={36}
              />
              <div className="grow">
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {inv.email.split('@')[0]}
                  {inv.role && (
                    <span className="muted" style={{ fontWeight: 400 }}>
                      {' '}
                      · {inv.role}
                    </span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {inv.email}
                </div>
              </div>
              <Pill dot="#C07A00">Invited when you post</Pill>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="close"
                aria-label={`Remove ${inv.email}`}
                onClick={() => setInvites((l) => l.filter((i) => i.email !== inv.email))}
              />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13 }}>
            Collaborators confirm before they appear on the project.
          </p>
        </section>

        <section className="card post-card" style={{ gap: 14 }}>
          <h2 className="h2" style={{ fontSize: 20 }}>
            Who can see this?
          </h2>
          <div className="vis-grid">
            {VISIBILITY.map((v) => {
              const on = v.value === visibility
              return (
                <label key={v.value} className={on ? 'vis-option vis-option--on' : 'vis-option'}>
                  <input
                    type="radio"
                    name="visibility"
                    checked={on}
                    onChange={() => setVisibility(v.value)}
                  />
                  <span style={{ color: 'var(--navy-ink)' }}>
                    <Icon name={v.icon} size={20} />
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{v.label}</span>
                  <span className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
                    {v.hint}
                  </span>
                </label>
              )
            })}
          </div>
        </section>

        {problem && (
          <div className="stack" style={{ gap: 6 }}>
            <ErrorText>{problem.message}</ErrorText>
            {problem.projectId && (
              <Link to={`/projects/${problem.projectId}`}>Go to the project →</Link>
            )}
          </div>
        )}

        <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
          <Button
            onClick={() => publish.mutate('PRIVATE')}
            disabled={!ready || publish.isPending}
            title="Saved privately — only you and collaborators can see it"
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            onClick={() => publish.mutate(visibility)}
            disabled={!ready || publish.isPending}
          >
            {publish.isPending ? 'Posting…' : 'Publish project'}
          </Button>
        </div>
      </div>

      <aside className="post-aside">
        <span className="lbl">Live preview</span>
        <article className="card" style={{ overflow: 'hidden' }}>
          <Cover
            project={{
              id: `preview-${type}`,
              title: title || 'Untitled project',
              coverUrl: previewCover,
            }}
            height={200}
          />
          <div className="stack" style={{ padding: 16, gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <Badge bg={meta.bg} ink={meta.ink}>
                {meta.badge}
              </Badge>
              {status && (
                <Pill dot={PROJECT_STATUSES[status].dot}>{PROJECT_STATUSES[status].label}</Pill>
              )}
            </div>
            {courseCode && courseOk && (
              <span className="muted" style={{ fontSize: 13 }}>
                Built for {courseCode}
              </span>
            )}
            <h3 className="disp" style={{ margin: '2px 0 0', fontSize: 21 }}>
              {title || 'Untitled project'}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-3)' }}>
              {pitch || 'Your one-line pitch shows up here.'}
            </p>
            <div className="row" style={{ gap: 8, paddingTop: 6 }}>
              <Avatar person={user} size={28} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {user.name.split(/\s+/)[0]}
                {invites.length > 0 && ` +${invites.length}`}
              </span>
              <span className="muted push" style={{ fontSize: 13 }}>
                {VISIBILITY.find((v) => v.value === visibility)?.label}
              </span>
            </div>
          </div>
        </article>
        <div className="card tips">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Tips for a good post</span>
          {[
            'A real screenshot beats a logo as the cover',
            'Say what problem it solves, not how it works',
            'Ask one specific question to get useful feedback',
          ].map((tip) => (
            <span key={tip} className="tips__tip">
              <Icon name="check" size={16} />
              {tip}
            </span>
          ))}
        </div>
      </aside>
    </div>
  )
}
