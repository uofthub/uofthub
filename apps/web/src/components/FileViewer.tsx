import { useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type FilePreview, type ProjectFile } from '../lib/api'
import { CSV_ROW_CAP, parseCsv } from '../lib/csv'
import { extOf, formatBytes, lookFor } from '../lib/files'
import { Button, Card, Chip, cx, dialogPanel, EmptyState, Icon, Scrim, Spinner } from './ui'
import Markdown, { DocTable, docPre } from './Markdown'

/**
 * The in-app document viewer.
 *
 * Files used to be download-only links, which meant leaving the page — and
 * trusting an unknown binary — just to see what a project actually contains.
 * Anything a browser can render is now rendered here instead, over the signed
 * URL the API hands back (see GET /projects/:id/files/:fileId/preview).
 */

function CsvTable({ text }: { text: string }) {
  const rows = parseCsv(text)
  if (rows.length === 0) return <p className="text-muted">This file is empty.</p>

  const [header, ...body] = rows
  const shown = body.slice(0, CSV_ROW_CAP)

  return (
    <>
      <DocTable header={header} rows={shown} />
      <p className="mt-3 text-13 text-muted">
        {body.length > shown.length
          ? `Showing the first ${CSV_ROW_CAP} of ${body.length} rows — download the file for all of it.`
          : `${body.length} ${body.length === 1 ? 'row' : 'rows'}.`}
      </p>
    </>
  )
}

function Preview({ preview, name }: { preview: FilePreview; name: string }) {
  if (preview.kind === 'text') {
    const ext = extOf(name)
    return (
      <>
        {preview.truncated && (
          <p className="mb-3 flex items-center gap-1.5 text-13 text-muted">
            <Icon name="info" size={15} /> This file is large — only the beginning is shown.
            Download it for the rest.
          </p>
        )}
        {ext === 'md' ? (
          <Markdown source={preview.text} />
        ) : ext === 'csv' ? (
          <CsvTable text={preview.text} />
        ) : (
          <pre className={cx(docPre, 'whitespace-pre-wrap')}>{preview.text}</pre>
        )}
      </>
    )
  }

  if (preview.kind === 'image') {
    return (
      <img
        src={preview.url}
        alt={name}
        className="mx-auto max-h-[72vh] max-w-full rounded-btn object-contain"
      />
    )
  }

  if (preview.kind === 'pdf') {
    // Rendered by the browser's own PDF viewer, sandboxed to the storage origin
    // it is served from — it can neither reach this page nor a uofthub cookie.
    return (
      <iframe
        src={preview.url}
        title={name}
        className="h-[74vh] w-full rounded-btn border-none bg-white"
      />
    )
  }

  if (preview.kind === 'video') {
    return (
      <video src={preview.url} controls className="mx-auto max-h-[72vh] max-w-full rounded-btn" />
    )
  }

  return (
    <div className="py-10 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-navy-tint text-navy-ink">
        <Icon name="music" size={30} />
      </span>
      <audio src={preview.url} controls className="mt-6 block w-full" />
    </div>
  )
}

export default function FileViewer({
  projectId,
  files,
  fileId,
  onSelect,
  onClose,
}: {
  projectId: string
  /** The previewable files, in list order — what the arrows page through. */
  files: ProjectFile[]
  fileId: string
  onSelect: (fileId: string) => void
  onClose: () => void
}) {
  const index = files.findIndex((f) => f.id === fileId)
  const file = files[index]

  const { data, isLoading, error } = useQuery({
    queryKey: ['file-preview', projectId, fileId],
    queryFn: () => api.projects.filePreview(projectId, fileId),
    // The signed URL inside expires in five minutes, so don't serve one from
    // cache for longer than it is good for.
    staleTime: 4 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
    retry: false,
  })

  const step = useCallback(
    (by: number) => {
      const next = files[index + by]
      if (next) onSelect(next.id)
    },
    [files, index, onSelect]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, step])

  if (!file) return null
  const look = lookFor(file.name)

  return (
    <Scrim onClose={onClose}>
      <Card
        className={cx(dialogPanel, 'max-w-250')}
        role="dialog"
        aria-modal="true"
        aria-label={file.name}
      >
        <div className="flex items-center gap-3 border-b border-line-soft py-3.5 pr-4 pl-5">
          <span
            className="flex size-10 items-center justify-center rounded-btn"
            style={{ background: look.bg, color: look.ink }}
          >
            <Icon name={look.icon} size={20} />
          </span>
          <div className="min-w-0 grow">
            <div className="line-clamp-1 font-semibold">{file.name}</div>
            <div className="text-13 text-muted">
              {formatBytes(file.sizeBytes)} · {new Date(file.uploadedAt).toLocaleDateString()}
            </div>
          </div>

          {files.length > 1 && (
            <div className="flex items-center gap-1">
              <Button
                size="md"
                variant="ghost"
                iconOnly
                icon="chevronLeft"
                onClick={() => step(-1)}
                disabled={index === 0}
                aria-label="Previous file"
              />
              <span className="text-13 text-muted">
                {index + 1} / {files.length}
              </span>
              <Button
                size="md"
                variant="ghost"
                iconOnly
                icon="chevronRight"
                onClick={() => step(1)}
                disabled={index === files.length - 1}
                aria-label="Next file"
              />
            </div>
          )}

          <Button size="md" icon="download" href={api.projects.downloadUrl(projectId, file.id)}>
            Download
          </Button>
          <Button
            size="md"
            variant="ghost"
            iconOnly
            icon="close"
            onClick={onClose}
            aria-label="Close"
          />
        </div>

        <div className="overflow-auto p-5">
          {isLoading ? (
            <Spinner label="Opening…" />
          ) : error || !data ? (
            <EmptyState
              icon="eyeOff"
              title={(error as Error | null)?.message ?? 'This file could not be opened.'}
              action={<Chip size="sm">{extOf(file.name).toUpperCase() || 'FILE'}</Chip>}
            />
          ) : (
            <Preview preview={data} name={file.name} />
          )}
        </div>
      </Card>
    </Scrim>
  )
}
