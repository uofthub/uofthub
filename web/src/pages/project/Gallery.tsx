import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, safeUrl, type ProjectDetail, type ProjectFile } from '../../lib/api'
import { lookFor, previewKindFor } from '../../lib/files'
import { OUTPUT_KINDS, outputLabel, primaryOutput, resolveOutputs } from '../../lib/outputs'
import FileViewer from '../../components/FileViewer'
import { Cover, CoverTag } from '../../components/project'
import { cx, ErrorText, Icon } from '../../components/ui'

/** A thumbnail in the strip; the one on show gets a navy frame. */
const thumb = (on = false) =>
  cx(
    'h-14.5 w-24 overflow-hidden rounded-btn bg-surface md:h-19.5 md:w-33',
    on ? 'border-2 border-navy' : 'border border-line'
  )

/** The large frame's picture or video, filling it edge to edge. */
const fill = 'block size-full object-cover'

/** The large frame's click target — a zoom-in over whatever it shows. */
const opener = 'block size-full cursor-zoom-in'

/** How many thumbnails the strip shows before "+N". */
const STRIP = 6

const isMedia = (f: ProjectFile) => {
  const kind = previewKindFor(f.name)
  return kind === 'image' || kind === 'video'
}

/** A signed preview URL for one image or video — they expire, so briefly cached. */
function usePreviewUrl(projectId: string, file: ProjectFile | undefined) {
  const { data } = useQuery({
    queryKey: ['file-preview', projectId, file?.id],
    queryFn: () => api.projects.filePreview(projectId, file!.id),
    enabled: !!file,
    staleTime: 4 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
    retry: false,
  })
  return data && data.kind !== 'text' ? data.url : undefined
}

function Thumb({
  projectId,
  file,
  selected,
  onClick,
}: {
  projectId: string
  file: ProjectFile
  selected: boolean
  onClick: () => void
}) {
  const kind = previewKindFor(file.name)
  const url = usePreviewUrl(projectId, kind === 'image' ? file : undefined)
  const look = lookFor(file.name)

  return (
    <button
      type="button"
      className={thumb(selected)}
      aria-label={`Show ${file.name}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span
          className="flex size-full items-center justify-center"
          style={{ background: look.bg, color: look.ink }}
        >
          <Icon name={kind === 'video' ? 'play' : look.icon} size={20} />
        </span>
      )}
    </button>
  )
}

/** The primary output shown by its thumbnail: opens the output itself. */
function LeadFrame({
  src,
  label,
  href,
  onOpen,
}: {
  src: string
  label: string
  href?: string
  onOpen: () => void
}) {
  const image = <img src={src} alt="" className={cx(fill, 'bg-fill object-contain')} />
  return href ? (
    <a className={opener} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {image}
    </a>
  ) : (
    <button type="button" className={opener} onClick={onOpen} aria-label={label}>
      {image}
    </button>
  )
}

function MainMedia({
  projectId,
  file,
  onOpen,
}: {
  projectId: string
  file: ProjectFile
  onOpen: () => void
}) {
  const kind = previewKindFor(file.name)
  const url = usePreviewUrl(projectId, file)

  if (kind === 'video') {
    return url ? (
      <video src={url} controls className={cx(fill, 'bg-[#111]')} />
    ) : (
      <div className={cx(fill, 'bg-fill')} />
    )
  }
  return (
    <button type="button" className={opener} onClick={onOpen} aria-label={`Open ${file.name}`}>
      {url ? (
        <img src={url} alt={file.name} className={cx(fill, 'bg-fill')} />
      ) : (
        <div className={cx(fill, 'bg-fill')} />
      )}
    </button>
  )
}

/** The id the lead frame is selected by, when it is not one of the media. */
const LEAD = 'lead'

/**
 * The project page's media: one large frame and a strip of thumbnails under
 * it. The primary output leads — its own image or video, or for a poster PDF
 * or a link its thumbnail, which opens the thing itself. Images and videos the
 * project has uploaded follow; a project with none of either shows its cover.
 * Every other file (a PDF, a CSV) is listed in the details card instead, since
 * a thumbnail of a spreadsheet says nothing.
 */
export function Gallery({ project, isOwner }: { project: ProjectDetail; isOwner: boolean }) {
  const qc = useQueryClient()
  const primary = primaryOutput(resolveOutputs(project))
  // A primary image or video simply goes first among the media; anything else
  // with a thumbnail gets a frame of its own in front of them.
  const primaryMedia = primary?.file && isMedia(primary.file) ? primary.file : undefined
  const lead = !primaryMedia && primary?.thumbnailUrl ? primary : undefined
  const media = [
    ...(primaryMedia ? [primaryMedia] : []),
    ...project.files.filter((f) => isMedia(f) && f.id !== primaryMedia?.id),
  ]
  const [selectedId, setSelectedId] = useState<string | undefined>(lead ? LEAD : media[0]?.id)
  const [viewing, setViewing] = useState<string | null>(null)
  const showingLead = !!lead && (selectedId === LEAD || media.length === 0)
  const selected = showingLead ? undefined : (media.find((f) => f.id === selectedId) ?? media[0])
  const leadHref = lead?.link ? safeUrl(lead.link.url) : undefined
  const openLead = () => {
    if (lead?.file && previewKindFor(lead.file.name)) setViewing(lead.file.id)
    else if (lead?.file) window.location.assign(api.projects.downloadUrl(project.id, lead.file.id))
  }

  const upload = useMutation({
    mutationFn: (file: File) => api.projects.uploadFile(project.id, file),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      setSelectedId(file.id)
    },
  })

  const previewable = project.files.filter((f) => previewKindFor(f.name))
  const videos = media.filter((f) => previewKindFor(f.name) === 'video').length
  const summary = [
    media.length - videos > 0 &&
      `${media.length - videos} image${media.length - videos === 1 ? '' : 's'}`,
    videos > 0 && `${videos} video${videos === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' and ')

  return (
    <div className="flex flex-col gap-3">
      {viewing && (
        <FileViewer
          projectId={project.id}
          files={previewable}
          fileId={viewing}
          onSelect={setViewing}
          onClose={() => setViewing(null)}
        />
      )}

      <div className="h-65 overflow-hidden rounded-[18px] border border-line bg-surface md:h-130">
        {showingLead && lead ? (
          <LeadFrame
            src={lead.thumbnailUrl!}
            label={`${OUTPUT_KINDS[lead.kind].action}: ${outputLabel(lead)}`}
            href={leadHref}
            onOpen={openLead}
          />
        ) : selected ? (
          <MainMedia
            projectId={project.id}
            file={selected}
            onOpen={() => setViewing(selected.id)}
          />
        ) : (
          <Cover project={project} height={520} style={{ height: '100%' }}>
            {isOwner && (
              <CoverTag icon={<Icon name="image" size={14} />}>
                Add an image, or lead with an output, to replace this cover
              </CoverTag>
            )}
          </Cover>
        )}
      </div>

      {(media.length + (lead ? 1 : 0) > 1 || isOwner) && (
        <div className="flex flex-wrap gap-2.5">
          {lead && (
            <button
              type="button"
              className={thumb(showingLead)}
              aria-label={`Show ${outputLabel(lead)}`}
              aria-pressed={showingLead}
              onClick={() => setSelectedId(LEAD)}
            >
              <img src={lead.thumbnailUrl} alt="" className="size-full object-cover" />
            </button>
          )}
          {media.slice(0, STRIP - (lead ? 1 : 0)).map((f) => (
            <Thumb
              key={f.id}
              projectId={project.id}
              file={f}
              selected={f.id === selected?.id}
              onClick={() => setSelectedId(f.id)}
            />
          ))}
          {isOwner && (
            <label
              className={cx(
                thumb(),
                'flex cursor-pointer flex-col items-center justify-center gap-1 border-[1.5px] border-dashed border-line-dashed bg-fill-warm text-12 font-semibold text-navy-ink'
              )}
              aria-label="Add an image or video"
            >
              <Icon name={upload.isPending ? 'upload' : 'plus'} size={20} />
              <span>{upload.isPending ? 'Uploading…' : 'Add media'}</span>
              <input
                type="file"
                accept="image/*,video/mp4,video/webm"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) upload.mutate(file)
                }}
              />
            </label>
          )}
          {media.length > 0 && selected && (
            <span className="ml-auto self-center text-13 text-muted">
              {media.indexOf(selected) + 1} of {media.length} · {summary}
            </span>
          )}
        </div>
      )}
      {upload.isError && <ErrorText>{(upload.error as Error).message}</ErrorText>}
    </div>
  )
}
