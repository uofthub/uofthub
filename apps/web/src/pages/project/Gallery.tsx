import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ProjectDetail, type ProjectFile } from '../../lib/api'
import { lookFor, previewKindFor } from '../../lib/files'
import FileViewer from '../../components/FileViewer'
import { Cover, CoverTag } from '../../components/project'
import { ErrorText, Icon } from '../../components/ui'

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
      className={selected ? 'thumb thumb--on' : 'thumb'}
      aria-label={`Show ${file.name}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {url ? (
        <img src={url} alt="" />
      ) : (
        <span className="thumb__file" style={{ background: look.bg, color: look.ink }}>
          <Icon name={kind === 'video' ? 'play' : look.icon} size={20} />
        </span>
      )}
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
      <video src={url} controls className="gallery__media" />
    ) : (
      <div className="gallery__media gallery__media--wait" />
    )
  }
  return (
    <button
      type="button"
      className="gallery__open"
      onClick={onOpen}
      aria-label={`Open ${file.name}`}
    >
      {url ? (
        <img src={url} alt={file.name} className="gallery__media" />
      ) : (
        <div className="gallery__media gallery__media--wait" />
      )}
    </button>
  )
}

/**
 * The project page's media: one large frame and a strip of thumbnails under
 * it. Images and videos the project has uploaded fill it; a project with none
 * shows its cover. Every other file (a PDF, a CSV) is listed in the details
 * card instead, since a thumbnail of a spreadsheet says nothing.
 */
export function Gallery({ project, isOwner }: { project: ProjectDetail; isOwner: boolean }) {
  const qc = useQueryClient()
  const media = project.files.filter(isMedia)
  const [selectedId, setSelectedId] = useState<string | undefined>(media[0]?.id)
  const [viewing, setViewing] = useState<string | null>(null)
  const selected = media.find((f) => f.id === selectedId) ?? media[0]

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
    <div className="stack" style={{ gap: 12 }}>
      {viewing && (
        <FileViewer
          projectId={project.id}
          files={previewable}
          fileId={viewing}
          onSelect={setViewing}
          onClose={() => setViewing(null)}
        />
      )}

      <div className="gallery__frame">
        {selected ? (
          <MainMedia
            projectId={project.id}
            file={selected}
            onOpen={() => setViewing(selected.id)}
          />
        ) : (
          <Cover project={project} height={520} style={{ height: '100%' }}>
            {isOwner && (
              <CoverTag icon={<Icon name="image" size={14} />}>
                Add a screenshot to replace this cover
              </CoverTag>
            )}
          </Cover>
        )}
      </div>

      {(media.length > 1 || isOwner) && (
        <div className="gallery__strip">
          {media.slice(0, STRIP).map((f) => (
            <Thumb
              key={f.id}
              projectId={project.id}
              file={f}
              selected={f.id === selected?.id}
              onClick={() => setSelectedId(f.id)}
            />
          ))}
          {isOwner && (
            <label className="thumb thumb--add" aria-label="Add an image or video">
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
          {media.length > 0 && (
            <span className="muted gallery__count">
              {media.indexOf(selected!) + 1} of {media.length} · {summary}
            </span>
          )}
        </div>
      )}
      {upload.isError && <ErrorText>{(upload.error as Error).message}</ErrorText>}
    </div>
  )
}
