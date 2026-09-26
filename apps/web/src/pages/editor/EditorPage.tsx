import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Visibility } from '@uofthub/types'
import { api, type ImportedLink, type ProjectDetail } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatBytes } from '../../lib/files'
import { useDocumentTitle } from '../../lib/hooks'
import { outputKindForLink } from '../../lib/outputs'
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
  Spinner,
  TextArea,
  type IconName,
} from '../../components/ui'
import { typeForUrl, TYPE_FORMS } from './compose'
import {
  applyTemplate,
  draftFromProject,
  emptyDraft,
  newId,
  settle,
  suggestedDetails,
  type Draft,
  type DraftOutput,
} from './draft'
import { OutputsEditor } from './OutputsEditor'
import { DetailsEditor, ReferencesEditor, SectionsEditor } from './Parts'
import { saveDraft } from './save'
import { TagInput } from './TagInput'
import './editor.css'

const PITCH_MAX = 120
const FILE_MAX = 8

const VISIBILITY: { value: Visibility; label: string; hint: string; icon: IconName }[] = [
  { value: 'PUBLIC', label: 'Public', hint: 'Anyone on the web, and search engines', icon: 'globe' },
  {
    value: 'UOFT',
    label: 'U of T only',
    hint: 'Signed-in students and staff. Good for class work.',
    icon: 'lock',
  },
  { value: 'UNLISTED', label: 'Unlisted', hint: 'Only people with the link', icon: 'link' },
  { value: 'PRIVATE', label: 'Draft', hint: 'Only you and your collaborators', icon: 'eyeOff' },
]

/**
 * The one page for making a project and for changing it: /projects/new and
 * /projects/:id/edit. It loads what it needs, then hands a starting draft to
 * the form — a saved project, or a blank one with the course's template
 * applied when the link named a course.
 */
export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const course = params.get('course')?.trim().toUpperCase() ?? ''

  const project = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.projects.get(id!),
    enabled: !!id,
  })
  const template = useQuery({
    queryKey: ['course-template', course],
    queryFn: () => api.courses.template(course),
    enabled: !id && isCourseCode(course),
    retry: false,
  })
  useDocumentTitle(id ? 'Edit project' : 'Share your work')

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
  if ((id && project.isLoading) || (!id && template.isLoading)) return <Spinner />
  if (id && (!project.data || project.data.ownerId !== user.id)) {
    return (
      <div className="page">
        <EmptyState icon="lock" title="Only the project’s owner can edit it">
          <Link to={id ? `/projects/${id}` : '/'}>Back to the project</Link>
        </EmptyState>
      </div>
    )
  }

  const initial = project.data
    ? draftFromProject(project.data)
    : (() => {
        const blank = emptyDraft({
          status: params.get('status') === 'HELP_WANTED' ? 'HELP_WANTED' : 'IN_PROGRESS',
          courseCode: isCourseCode(course) ? course : '',
        })
        return template.data ? applyTemplate(blank, template.data) : blank
      })()

  return <EditorForm initial={initial} project={project.data} />
}

function EditorForm({ initial, project }: { initial: Draft; project?: ProjectDetail }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [draft, setDraft] = useState(initial)
  // Set once a new project exists, so saving again writes to it.
  const [projectId, setProjectId] = useState(project?.id)
  const [visibility, setVisibility] = useState<Visibility>(
    project?.visibility ?? initial.visibility
  )
  const [failed, setFailed] = useState<string[]>([])
  const [importUrl, setImportUrl] = useState('')
  const [invite, setInvite] = useState({ email: '', role: '' })

  const editing = !!project
  const takenDown = !!project?.takenDownAt
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const updateOutput = (key: string, patch: Partial<DraftOutput>) =>
    setDraft((d) => ({
      ...d,
      outputs: d.outputs.map((o) => (o.key === key ? { ...o, ...patch } : o)),
    }))

  const courseCode = draft.courseCode.trim().toUpperCase()
  const courseOk = !courseCode || isCourseCode(courseCode)
  // A course typed in that has a template the draft has not used yet.
  const offer = useQuery({
    queryKey: ['course-template', courseCode],
    queryFn: () => api.courses.template(courseCode),
    enabled: isCourseCode(courseCode) && draft.template?.code !== courseCode,
    retry: false,
    staleTime: 60 * 60 * 1000,
  })

  const firstImage = draft.newFiles.find((f) => f.type.startsWith('image/'))
  const lead = draft.outputs.find((o) => o.primary)
  const previewFile = useMemo(
    () => (firstImage ? URL.createObjectURL(firstImage) : undefined),
    [firstImage]
  )
  const previewCover = (lead?.thumbnail !== 'remove' && lead?.thumbnailUrl) || previewFile

  const setType = (type: ProjectType) =>
    setDraft((d) => ({
      ...d,
      type,
      // A type's usual details are offered as empty rows, but only while the
      // student has written none of their own.
      details: d.details.some((x) => x.value.trim()) ? d.details : suggestedDetails(type),
    }))

  const importLink = useMutation({
    mutationFn: (url: string) => api.projects.importLink(url),
    onSuccess: (got: ImportedLink) => {
      setDraft((d) => {
        const type = d.type ?? got.type ?? typeForUrl(got.url)
        const links = got.links.filter(
          (l) => !d.outputs.some((o) => o.target.type === 'newLink' && o.target.url === l.url)
        )
        const hasPrimary = d.outputs.some((o) => o.primary)
        const outputs: DraftOutput[] = links.map((l, n) => ({
          key: newId('o'),
          kind: outputKindForLink(l),
          label: '',
          primary: !hasPrimary && n === 0 && !got.image,
          target: { type: 'newLink', label: l.label, url: l.url },
        }))
        const image = got.image
          ? new File(
              [Uint8Array.from(atob(got.image.dataBase64), (c) => c.charCodeAt(0))],
              got.image.name,
              { type: got.image.contentType }
            )
          : null
        return {
          ...d,
          type,
          title: d.title || got.title?.slice(0, 120) || '',
          pitch:
            d.pitch ||
            (got.pitch && got.pitch.length > PITCH_MAX
              ? `${got.pitch.slice(0, PITCH_MAX - 1).trimEnd()}…`
              : (got.pitch ?? '')),
          description: d.description || got.description || '',
          tags: [...new Set([...d.tags, ...got.tags.map((t) => t.toLowerCase())])],
          outputs: [...d.outputs, ...outputs],
          // The page's picture first, so it becomes the cover.
          newFiles: image ? [image, ...d.newFiles].slice(0, FILE_MAX) : d.newFiles,
        }
      })
    },
  })

  const save = useMutation({
    mutationFn: (as: Visibility | undefined) =>
      saveDraft(draft, { projectId, visibility: as }, api.projects),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['userProjects'] })
      qc.invalidateQueries({ queryKey: ['project', result.projectId] })
      if (result.failed.length === 0) {
        navigate(`/projects/${result.projectId}`)
        return
      }
      setProjectId(result.projectId)
      setDraft((d) => settle(d, result))
      setFailed(result.failed)
    },
    onError: (e: Error) => setFailed([e.message]),
  })

  const addInvite = () => {
    const email = invite.email.trim().toLowerCase()
    if (!email || draft.invites.some((i) => i.email === email)) return
    update({ invites: [...draft.invites, { email, role: invite.role.trim() }] })
    setInvite({ email: '', role: '' })
  }

  // The project's files and links that are not outputs, to offer as ones.
  const usedFiles = new Set(draft.outputs.flatMap((o) => (o.target.type === 'file' ? [o.target.fileId] : [])))
  const usedLinks = new Set(draft.outputs.flatMap((o) => (o.target.type === 'link' ? [o.target.linkId] : [])))
  const spareFiles = (project?.files ?? []).filter((f) => !usedFiles.has(f.id))
  const spareLinks = (project?.links ?? []).filter((l) => !usedLinks.has(l.id))

  const ready = !!draft.title.trim() && courseOk && !save.isPending
  const meta = draft.type ? PROJECT_TYPES[draft.type] : null
  const drop = draft.type ? TYPE_FORMS[draft.type].drop : TYPE_FORMS.OTHER.drop
  const choices = editing ? VISIBILITY : VISIBILITY.filter((v) => v.value !== 'PRIVATE')

  return (
    <div className="page page--wide post-grid">
      <div className="stack" style={{ gap: 22, minWidth: 0 }}>
        <div>
          <h1 className="page-title">{editing ? 'Edit project' : 'Share your work'}</h1>
          <p className="page-lede">
            {editing
              ? 'Everything here is optional except the title. Anything you leave empty won’t show.'
              : 'Put in as much or as little as you like — anything left empty won’t show. It stays a private draft until you publish.'}
          </p>
        </div>

        {draft.template && (
          <div className="notice">
            <Icon name="info" size={20} />
            <div>
              <b>Started from the {draft.template.code} template</b>
              <p>Its sections are suggestions. Fill in what fits; empty ones are left out.</p>
            </div>
          </div>
        )}

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            What are you sharing?
          </h2>
          <div className="type-grid">
            {PROJECT_TYPE_KEYS.map((k) => {
              const t = PROJECT_TYPES[k]
              const on = k === draft.type
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
            Section headings and suggested details follow the type you pick.
          </p>
        </section>

        {!editing && (
          <section className="card post-card" style={{ gap: 12 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>
              Start from a link <span className="post-card__optional">· optional</span>
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
                  placeholder="A video, a paper, a portfolio page, a repository, a Drive folder…"
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
                We’ll fill in what the page says about itself, for you to edit.
              </p>
            )}
          </section>
        )}

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            The basics
          </h2>
          <Field label="Title">
            <Input
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Give it a short, specific name"
              maxLength={120}
            />
          </Field>
          <Field label="One-line pitch" hint={`Up to ${PITCH_MAX} characters. This is what shows on cards.`}>
            <Input
              value={draft.pitch}
              onChange={(e) => update({ pitch: e.target.value })}
              placeholder="What is it, in one sentence?"
              maxLength={PITCH_MAX}
            />
          </Field>
          <div className="post-fields">
            <Field
              label="Made for a course?"
              hint={courseOk ? 'Files it under that course' : 'That doesn’t look like a course code — try CSC211H5'}
              className="post-fields__half"
            >
              <Input
                value={draft.courseCode}
                onChange={(e) => update({ courseCode: e.target.value })}
                placeholder="e.g. CSC211H5"
                maxLength={8}
              />
            </Field>
            <Field label="Tags" hint="Topics, methods, tools" className="post-fields__half">
              <TagInput value={draft.tags} onChange={(tags) => update({ tags })} />
            </Field>
          </div>
          {offer.data && (
            <div className="notice">
              <Icon name="sparkle" size={20} />
              <div className="grow">
                <b>{offer.data.code} has a template</b>
                <p>{offer.data.intro}</p>
              </div>
              <Button size="sm" onClick={() => setDraft((d) => applyTemplate(d, offer.data!))}>
                Use it
              </Button>
            </div>
          )}
          <div className="stack" style={{ gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Status</span>
            <div className="row wrap" style={{ gap: 8 }}>
              {PROJECT_STATUS_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={draft.status === k ? 'pill pill--on' : 'pill'}
                  aria-pressed={draft.status === k}
                  onClick={() => update({ status: draft.status === k ? null : k })}
                >
                  <i style={{ background: PROJECT_STATUSES[k].dot }} />
                  {PROJECT_STATUSES[k].label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            Outputs <span className="post-card__optional">· what it produced</span>
          </h2>
          <OutputsEditor
            outputs={draft.outputs}
            hint={draft.hints.output}
            files={spareFiles}
            links={spareLinks}
            onChange={(outputs) => update({ outputs })}
            onUpdate={updateOutput}
          />
        </section>

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            Overview
          </h2>
          <Field label="What it is" hint="Markdown works. Left empty, it won’t show.">
            <TextArea
              rows={6}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="A few sentences a student in another faculty could follow."
            />
          </Field>
        </section>

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            Sections <span className="post-card__optional">· add only what fits</span>
          </h2>
          <SectionsEditor
            sections={draft.sections}
            type={draft.type}
            onChange={(sections) => update({ sections })}
          />
        </section>

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            Details <span className="post-card__optional">· short facts</span>
          </h2>
          <DetailsEditor details={draft.details} onChange={(details) => update({ details })} />
        </section>

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            References <span className="post-card__optional">· what you drew on</span>
          </h2>
          <ReferencesEditor
            references={draft.references}
            hint={draft.hints.references}
            onChange={(references) => update({ references })}
          />
        </section>

        <section className="card post-card">
          <h2 className="h2" style={{ fontSize: 20 }}>
            Images and other files
          </h2>
          <label className="dropzone">
            <span className="dropzone__icon">
              <Icon name="image" size={20} />
            </span>
            <span className="grow">
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{drop.title}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {drop.hint}
              </span>
            </span>
            <span className="btn btn--md">Browse files</span>
            <input
              type="file"
              multiple
              accept={drop.accept}
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                e.target.value = ''
                update({ newFiles: [...draft.newFiles, ...picked].slice(0, FILE_MAX) })
              }}
            />
          </label>
          {draft.newFiles.length > 0 && (
            <ul className="stack" style={{ gap: 6, listStyle: 'none', padding: 0 }}>
              {draft.newFiles.map((f, i) => (
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
                    onClick={() => update({ newFiles: draft.newFiles.filter((_, j) => j !== i) })}
                  />
                </li>
              ))}
            </ul>
          )}
          {editing && (
            <p className="muted" style={{ fontSize: 13 }}>
              Files already on the project are managed from its page’s ⋯ menu.
            </p>
          )}
        </section>

        {!editing && (
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
            {draft.invites.map((inv) => (
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
                <Pill dot="#C07A00">Invited when you save</Pill>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="close"
                  aria-label={`Remove ${inv.email}`}
                  onClick={() => update({ invites: draft.invites.filter((i) => i.email !== inv.email) })}
                />
              </div>
            ))}
            <p className="muted" style={{ fontSize: 13 }}>
              Collaborators confirm before they appear on the project.
            </p>
          </section>
        )}

        <section className="card post-card" style={{ gap: 14 }}>
          <h2 className="h2" style={{ fontSize: 20 }}>
            Who can see this?
          </h2>
          {takenDown ? (
            <p className="muted" style={{ fontSize: 14 }}>
              A moderator took this project down, so it stays private to you and your
              collaborators.
            </p>
          ) : (
            <div className="vis-grid">
              {choices.map((v) => {
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
          )}
          <Field
            label="Keep it hidden until"
            hint="Optional. Until this day (Toronto time) only you and your collaborators can see it — useful for course work before grades are out."
          >
            <div className="row" style={{ gap: 8 }}>
              <Input
                type="date"
                value={draft.showFrom}
                onChange={(e) => update({ showFrom: e.target.value })}
                style={{ width: 200 }}
              />
              {draft.showFrom && (
                <Button size="sm" variant="ghost" onClick={() => update({ showFrom: '' })}>
                  Clear
                </Button>
              )}
            </div>
          </Field>
        </section>

        {failed.length > 0 && (
          <div className="notice notice--danger">
            <Icon name="alert" size={20} />
            <div>
              <b>
                {projectId && !editing
                  ? 'Saved as a private draft, but some things didn’t go through'
                  : 'Some things didn’t go through'}
              </b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p>
                Fix them and save again — only what failed is retried.
                {projectId && !editing && (
                  <>
                    {' '}
                    <Link to={`/projects/${projectId}`}>See the draft →</Link>
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
          {editing ? (
            <>
              <Button to={`/projects/${project!.id}`}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => save.mutate(takenDown ? undefined : visibility)}
                disabled={!ready}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => save.mutate('PRIVATE')}
                disabled={!ready}
                title="Saved privately — only you and collaborators can see it"
              >
                Save draft
              </Button>
              <Button variant="primary" onClick={() => save.mutate(visibility)} disabled={!ready}>
                {save.isPending ? 'Saving…' : draft.showFrom ? 'Publish on that day' : 'Publish'}
              </Button>
            </>
          )}
        </div>
      </div>

      <aside className="post-aside">
        <span className="lbl">Live preview</span>
        <article className="card" style={{ overflow: 'hidden' }}>
          <Cover
            project={{
              id: `preview-${draft.type ?? 'none'}`,
              title: draft.title || 'Untitled project',
              coverUrl: previewCover || undefined,
            }}
            height={200}
          />
          <div className="stack" style={{ padding: 16, gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between', minHeight: 22 }}>
              {meta && (
                <Badge bg={meta.bg} ink={meta.ink}>
                  {meta.badge}
                </Badge>
              )}
              {draft.status && (
                <Pill dot={PROJECT_STATUSES[draft.status].dot}>
                  {PROJECT_STATUSES[draft.status].label}
                </Pill>
              )}
            </div>
            {courseCode && courseOk && (
              <span className="muted" style={{ fontSize: 13 }}>
                Made for {courseCode}
              </span>
            )}
            <h3 className="disp" style={{ margin: '2px 0 0', fontSize: 21 }}>
              {draft.title || 'Untitled project'}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-3)' }}>
              {draft.pitch || 'Your one-line pitch shows up here.'}
            </p>
            {user && (
              <div className="row" style={{ gap: 8, paddingTop: 6 }}>
                <Avatar person={user} size={28} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {user.name.split(/\s+/)[0]}
                  {draft.invites.length > 0 && ` +${draft.invites.length}`}
                </span>
                <span className="muted push" style={{ fontSize: 13 }}>
                  {VISIBILITY.find((v) => v.value === visibility)?.label}
                </span>
              </div>
            )}
          </div>
        </article>
        <div className="card tips">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Tips for a good post</span>
          {[
            'Lead with the thing itself — a poster, a clip, a page, a photo of the build',
            'Say what question it answers or what it makes possible',
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
