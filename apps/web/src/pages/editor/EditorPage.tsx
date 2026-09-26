import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Visibility } from '@uofthub/types'
import { api, importedImageFile, type ImportedLink, type ProjectDetail } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatBytes } from '../../lib/files'
import { useDocumentTitle, useReleasedObjectUrls } from '../../lib/hooks'
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
  Card,
  cx,
  Dialog,
  Dropzone,
  EmptyState,
  ErrorText,
  Eyebrow,
  Field,
  Heading,
  Icon,
  Input,
  LinkButton,
  Notice,
  Page,
  PageLede,
  PageTitle,
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
  keepRemoved,
  newId,
  removeExisting,
  settle,
  suggestedDetails,
  type Draft,
  type DraftOutput,
} from './draft'
import { OutputsEditor } from './OutputsEditor'
import { DetailsEditor, ReferencesEditor, SectionsEditor } from './Parts'
import { saveDraft } from './save'
import { TagInput } from './TagInput'

const PITCH_MAX = 120
const FILE_MAX = 8

const VISIBILITY: { value: Visibility; label: string; hint: string; icon: IconName }[] = [
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
  { value: 'PRIVATE', label: 'Draft', hint: 'Only you and your collaborators', icon: 'eyeOff' },
]

/**
 * One card of the form: a heading, with an optional grey note beside it
 * saying what the section is for.
 */
function EditorCard({
  title,
  note,
  className,
  children,
}: {
  title: ReactNode
  note?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Card as="section" className={cx('flex flex-col gap-4 p-4.5 md:p-6', className)}>
      <Heading className="text-20">
        {title}
        {note && (
          <>
            {' '}
            <span className="font-body text-14 font-medium text-ink-3">· {note}</span>
          </>
        )}
      </Heading>
      {children}
    </Card>
  )
}

/** A selectable card — a project type, a visibility — outlined navy when chosen. */
const choice = (on: boolean) =>
  cx(
    'border border-line bg-surface',
    on && 'border-navy-ink shadow-[inset_0_0_0_1px_var(--color-navy)]'
  )

/** A file or link already on the project or about to be uploaded, with a way to drop it. */
function FileRow({
  icon,
  name,
  size,
  onRemove,
}: {
  icon: IconName
  name: string
  size?: string
  onRemove: () => void
}) {
  return (
    <li className="flex items-center gap-2 text-14">
      <Icon name={icon} size={16} />
      <span className="line-clamp-1 min-w-0 grow">{name}</span>
      {size && <span className="text-muted">{size}</span>}
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="close"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      />
    </li>
  )
}

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
      <Page>
        <EmptyState
          icon="lock"
          title="Sign in to share your work"
          action={
            <Button variant="primary" to="/session">
              Sign in with your U of T email
            </Button>
          }
        />
      </Page>
    )
  }
  if ((id && project.isLoading) || (!id && template.isLoading)) return <Spinner />
  if (id && (!project.data || project.data.ownerId !== user.id)) {
    return (
      <Page>
        <EmptyState icon="lock" title="Only the project’s owner can edit it">
          <Link to={id ? `/projects/${id}` : '/'}>Back to the project</Link>
        </EmptyState>
      </Page>
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
  useReleasedObjectUrls([previewFile])
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
        const image = got.image ? importedImageFile(got.image) : null
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

  // Anything changed since the page opened, or since a save that went
  // through, is unsaved — and a long write-up is too much to lose to a
  // stray click or a closed tab.
  const dirty = draft !== initial || visibility !== (project?.visibility ?? initial.visibility)
  const leave = useLeaveGuard(dirty)

  const save = useMutation({
    mutationFn: (as: Visibility | undefined) =>
      saveDraft(draft, { projectId, visibility: as }, api.projects),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['userProjects'] })
      qc.invalidateQueries({ queryKey: ['project', result.projectId] })
      if (result.failed.length === 0) {
        leave.allow()
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
  const usedFiles = new Set(
    draft.outputs.flatMap((o) => (o.target.type === 'file' ? [o.target.fileId] : []))
  )
  const usedLinks = new Set(
    draft.outputs.flatMap((o) => (o.target.type === 'link' ? [o.target.linkId] : []))
  )
  const goneFiles = new Set(draft.removedFiles.map((f) => f.id))
  const goneLinks = new Set(draft.removedLinks.map((l) => l.id))
  const keptFiles = (project?.files ?? []).filter((f) => !goneFiles.has(f.id))
  const keptLinks = (project?.links ?? []).filter((l) => !goneLinks.has(l.id))
  const spareFiles = keptFiles.filter((f) => !usedFiles.has(f.id))
  const spareLinks = keptLinks.filter((l) => !usedLinks.has(l.id))
  const removed = draft.removedFiles.length + draft.removedLinks.length

  const ready = !!draft.title.trim() && courseOk && !save.isPending
  const meta = draft.type ? PROJECT_TYPES[draft.type] : null
  const drop = draft.type ? TYPE_FORMS[draft.type].drop : TYPE_FORMS.OTHER.drop
  const choices = editing ? VISIBILITY : VISIBILITY.filter((v) => v.value !== 'PRIVATE')

  return (
    <Page
      width="wide"
      className="grid grid-cols-1 items-start gap-10 pt-9 md:pt-9 lg:pt-9 xl:grid-cols-[minmax(0,1fr)_400px]"
    >
      {leave.blocker.state === 'blocked' && (
        <Dialog
          title="Leave without saving?"
          onClose={() => leave.blocker.reset?.()}
          width={440}
          footer={
            <>
              <Button onClick={() => leave.blocker.reset?.()}>Keep editing</Button>
              <Button variant="danger" onClick={() => leave.blocker.proceed?.()}>
                Leave
              </Button>
            </>
          }
        >
          <p>What you’ve changed here hasn’t been saved, and will be lost.</p>
        </Dialog>
      )}
      <div className="flex min-w-0 flex-col gap-5.5">
        <div>
          <PageTitle>{editing ? 'Edit project' : 'Share your work'}</PageTitle>
          <PageLede>
            {editing
              ? 'Everything here is optional except the title. Anything you leave empty won’t show.'
              : 'Put in as much or as little as you like — anything left empty won’t show. It stays a private draft until you publish.'}
          </PageLede>
        </div>

        {draft.template && (
          <Notice icon="info" title={`Started from the ${draft.template.code} template`}>
            Its sections are suggestions. Fill in what fits; empty ones are left out.
          </Notice>
        )}

        <EditorCard title="What are you sharing?">
          <div
            role="group"
            aria-label="Project type"
            className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4"
          >
            {PROJECT_TYPE_KEYS.map((k) => {
              const t = PROJECT_TYPES[k]
              const on = k === draft.type
              return (
                <button
                  key={k}
                  type="button"
                  className={cx(
                    choice(on),
                    'relative flex h-26 flex-col justify-between rounded-[14px] p-3.5 text-left text-ink hover:border-line-strong',
                    on && 'bg-navy/4'
                  )}
                  aria-pressed={on}
                  onClick={() => setType(k)}
                >
                  {on && (
                    <span className="absolute top-2.5 right-2.5 flex size-5.5 items-center justify-center rounded-full bg-navy text-white">
                      <Icon name="check" size={13} />
                    </span>
                  )}
                  <span className="text-navy-ink">
                    <Icon name={t.icon} size={22} />
                  </span>
                  <span>
                    <span className="block text-15 font-semibold">{t.label}</span>
                    <span className="text-13 text-muted">{t.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-13 text-muted">
            Section headings and suggested details follow the type you pick.
          </p>
        </EditorCard>

        {!editing && (
          <EditorCard title="Start from a link" note="optional" className="gap-3">
            <form
              className="flex items-center gap-2.5"
              onSubmit={(e) => {
                e.preventDefault()
                if (importUrl.trim()) importLink.mutate(importUrl.trim())
              }}
            >
              <label className="min-w-0 grow">
                <span className="sr-only">Link to import</span>
                <Input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="A video, a paper, a portfolio page, a repository, a Drive folder…"
                />
              </label>
              <Button
                type="submit"
                icon="link"
                disabled={!importUrl.trim() || importLink.isPending}
              >
                {importLink.isPending ? 'Importing…' : 'Import'}
              </Button>
            </form>
            {importLink.isError ? (
              <ErrorText>{(importLink.error as Error).message}</ErrorText>
            ) : importLink.isSuccess ? (
              <p className="flex items-center gap-1.5 text-13 text-green">
                <Icon name="check" size={15} /> Filled in from the link — check it over below.
              </p>
            ) : (
              <p className="text-13 text-muted">
                We’ll fill in what the page says about itself, for you to edit.
              </p>
            )}
          </EditorCard>
        )}

        <EditorCard title="The basics">
          <Field label="Title">
            <Input
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Give it a short, specific name"
              maxLength={120}
            />
          </Field>
          <Field
            label="One-line pitch"
            hint={`Up to ${PITCH_MAX} characters. This is what shows on cards.`}
          >
            <Input
              value={draft.pitch}
              onChange={(e) => update({ pitch: e.target.value })}
              placeholder="What is it, in one sentence?"
              maxLength={PITCH_MAX}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Made for a course?"
              hint={
                courseOk
                  ? 'Files it under that course'
                  : 'That doesn’t look like a course code — try CSC211H5'
              }
            >
              <Input
                value={draft.courseCode}
                onChange={(e) => update({ courseCode: e.target.value })}
                placeholder="e.g. CSC211H5"
                maxLength={8}
              />
            </Field>
            <Field label="Tags" hint="Topics, methods, tools">
              <TagInput value={draft.tags} onChange={(tags) => update({ tags })} />
            </Field>
          </div>
          {offer.data && (
            <Notice
              icon="sparkle"
              title={`${offer.data.code} has a template`}
              action={
                <Button size="sm" onClick={() => setDraft((d) => applyTemplate(d, offer.data!))}>
                  Use it
                </Button>
              }
            >
              {offer.data.intro}
            </Notice>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-14 font-semibold">Status</span>
            <div className="flex flex-wrap items-center gap-2">
              {PROJECT_STATUS_KEYS.map((k) => (
                <Pill
                  key={k}
                  dot={PROJECT_STATUSES[k].dot}
                  pressed={draft.status === k}
                  onClick={() => update({ status: draft.status === k ? null : k })}
                >
                  {PROJECT_STATUSES[k].label}
                </Pill>
              ))}
            </div>
          </div>
        </EditorCard>

        <EditorCard title="Outputs" note="what it produced">
          <OutputsEditor
            outputs={draft.outputs}
            hint={draft.hints.output}
            files={spareFiles}
            links={spareLinks}
            onChange={(outputs) => update({ outputs })}
            onUpdate={updateOutput}
          />
        </EditorCard>

        <EditorCard title="Overview">
          <Field label="What it is" hint="Markdown works. Left empty, it won’t show.">
            <TextArea
              rows={6}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="A few sentences a student in another faculty could follow."
            />
          </Field>
        </EditorCard>

        <EditorCard title="Sections" note="add only what fits">
          <SectionsEditor
            sections={draft.sections}
            type={draft.type}
            onChange={(sections) => update({ sections })}
          />
        </EditorCard>

        <EditorCard title="Details" note="short facts">
          <DetailsEditor details={draft.details} onChange={(details) => update({ details })} />
        </EditorCard>

        <EditorCard title="References" note="what you drew on">
          <ReferencesEditor
            references={draft.references}
            hint={draft.hints.references}
            onChange={(references) => update({ references })}
          />
        </EditorCard>

        <EditorCard title="Images and other files">
          <Dropzone icon="image" title={drop.title} hint={drop.hint}>
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
          </Dropzone>
          {draft.newFiles.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {draft.newFiles.map((f, i) => (
                <FileRow
                  key={`${f.name}-${i}`}
                  icon="file"
                  name={f.name}
                  size={formatBytes(f.size)}
                  onRemove={() => update({ newFiles: draft.newFiles.filter((_, j) => j !== i) })}
                />
              ))}
            </ul>
          )}
          {(keptFiles.length > 0 || keptLinks.length > 0) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-14 font-semibold">On the project now</span>
              <ul className="flex flex-col gap-1.5">
                {keptFiles.map((f) => (
                  <FileRow
                    key={f.id}
                    icon="file"
                    name={f.name}
                    size={formatBytes(f.sizeBytes)}
                    onRemove={() =>
                      setDraft((d) => removeExisting(d, 'file', { id: f.id, name: f.name }))
                    }
                  />
                ))}
                {keptLinks.map((l) => (
                  <FileRow
                    key={l.id}
                    icon="link"
                    name={l.label || l.url}
                    onRemove={() =>
                      setDraft((d) =>
                        removeExisting(d, 'link', { id: l.id, name: l.label || l.url })
                      )
                    }
                  />
                ))}
              </ul>
            </div>
          )}
          {removed > 0 && (
            <p className="flex items-center gap-2 text-13">
              <span className="text-muted">
                {removed === 1 ? 'One file or link' : `${removed} files and links`} will be deleted
                when you save, along with any output made of them.
              </span>
              <LinkButton onClick={() => setDraft(keepRemoved)}>Keep them</LinkButton>
            </p>
          )}
        </EditorCard>

        {!editing && (
          <EditorCard title="People" className="gap-3.5">
            <form
              className="flex flex-wrap items-center gap-2.5"
              onSubmit={(e) => {
                e.preventDefault()
                addInvite()
              }}
            >
              <label className="min-w-0 grow basis-60">
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
                className="w-50"
              />
              <Button type="submit" icon="userPlus" disabled={!invite.email.trim()}>
                Invite
              </Button>
            </form>
            {draft.invites.map((inv) => (
              <div key={inv.email} className="flex items-center gap-3 rounded-xl bg-fill p-3">
                <Avatar
                  person={{ id: inv.email, name: inv.email.split('@')[0].replace(/[._]/g, ' ') }}
                  size={36}
                />
                <div className="min-w-0 grow">
                  <div className="text-15 font-semibold">
                    {inv.email.split('@')[0]}
                    {inv.role && <span className="font-normal text-muted"> · {inv.role}</span>}
                  </div>
                  <div className="text-13 text-muted">{inv.email}</div>
                </div>
                <Pill dot="#C07A00">Invited when you save</Pill>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="close"
                  aria-label={`Remove ${inv.email}`}
                  onClick={() =>
                    update({ invites: draft.invites.filter((i) => i.email !== inv.email) })
                  }
                />
              </div>
            ))}
            <p className="text-13 text-muted">
              Collaborators confirm before they appear on the project.
            </p>
          </EditorCard>
        )}

        <EditorCard title="Who can see this?" className="gap-3.5">
          {takenDown ? (
            <p className="text-14 text-muted">
              A moderator took this project down, so it stays private to you and your collaborators.
            </p>
          ) : (
            <div className="flex flex-col gap-3 md:flex-row">
              {choices.map((v) => {
                const on = v.value === visibility
                return (
                  <label
                    key={v.value}
                    className={cx(
                      choice(on),
                      'relative flex flex-1 cursor-pointer flex-col gap-1.5 rounded-xl p-4'
                    )}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      checked={on}
                      onChange={() => setVisibility(v.value)}
                      className="absolute top-4 right-4 m-0 size-4.5 accent-navy-ink"
                    />
                    <span className="text-navy-ink">
                      <Icon name={v.icon} size={20} />
                    </span>
                    <span className="text-15 font-semibold">{v.label}</span>
                    <span className="text-13 leading-[1.4] text-muted">{v.hint}</span>
                  </label>
                )
              })}
            </div>
          )}
          <Field
            label="Keep it hidden until"
            hint="Optional. Until this day (Toronto time) only you and your collaborators can see it — useful for course work before grades are out."
          >
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={draft.showFrom}
                onChange={(e) => update({ showFrom: e.target.value })}
                className="w-50"
              />
              {draft.showFrom && (
                <Button size="sm" variant="ghost" onClick={() => update({ showFrom: '' })}>
                  Clear
                </Button>
              )}
            </div>
          </Field>
        </EditorCard>

        {failed.length > 0 && (
          <Notice
            tone="danger"
            icon="alert"
            title={
              projectId && !editing
                ? 'Saved as a private draft, but some things didn’t go through'
                : 'Some things didn’t go through'
            }
          >
            <ul className="mt-0.5 list-disc pl-4.5">
              {failed.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-1">
              Fix them and save again — only what failed is retried.
              {projectId && !editing && (
                <>
                  {' '}
                  <Link to={`/projects/${projectId}`}>See the draft →</Link>
                </>
              )}
            </p>
          </Notice>
        )}

        <div className="flex items-center justify-end gap-2.5">
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

      <aside className="sticky top-[calc(var(--spacing-header)+24px)] hidden flex-col gap-3 xl:flex">
        <Eyebrow as="span">Live preview</Eyebrow>
        <Card as="article" className="overflow-hidden">
          <Cover
            project={{
              id: `preview-${draft.type ?? 'none'}`,
              title: draft.title || 'Untitled project',
              coverUrl: previewCover || undefined,
            }}
            height={200}
          />
          <div className="flex flex-col gap-2 p-4">
            <div className="flex min-h-5.5 items-center justify-between">
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
              <span className="text-13 text-muted">Made for {courseCode}</span>
            )}
            <h3 className="mt-0.5 font-display text-21 font-bold">
              {draft.title || 'Untitled project'}
            </h3>
            <p className="text-14 leading-[1.45] text-ink-3">
              {draft.pitch || 'Your one-line pitch shows up here.'}
            </p>
            {user && (
              <div className="flex items-center gap-2 pt-1.5">
                <Avatar person={user} size={28} />
                <span className="text-13 font-semibold">
                  {user.name.split(/\s+/)[0]}
                  {draft.invites.length > 0 && ` +${draft.invites.length}`}
                </span>
                <span className="ml-auto text-13 text-muted">
                  {VISIBILITY.find((v) => v.value === visibility)?.label}
                </span>
              </div>
            )}
          </div>
        </Card>
        <Card className="flex flex-col gap-2.5 bg-fill-warm px-4.5 py-4">
          <span className="text-14 font-semibold">Tips for a good post</span>
          {[
            'Lead with the thing itself — a poster, a clip, a page, a photo of the build',
            'Say what question it answers or what it makes possible',
            'Ask one specific question to get useful feedback',
          ].map((tip) => (
            <span key={tip} className="flex gap-2 text-13 leading-normal text-ink-3">
              <Icon name="check" size={16} className="mt-px text-green" />
              {tip}
            </span>
          ))}
        </Card>
      </aside>
    </Page>
  )
}

/**
 * Asks before leaving with unsaved changes: a dialog for a move within the
 * app, the browser's own prompt for closing the tab or reloading. `allow()`
 * lets the next move through, for the one after a successful save.
 */
function useLeaveGuard(dirty: boolean) {
  const allowed = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !allowed.current && currentLocation.pathname !== nextLocation.pathname
  )
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  return {
    blocker,
    allow: () => {
      allowed.current = true
    },
  }
}
