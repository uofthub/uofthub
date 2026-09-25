import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type FilePreview, type ProjectFile } from '../lib/api'
import { CSV_ROW_CAP, parseCsv } from '../lib/csv'
import { extOf, formatBytes, lookFor } from '../lib/files'
import { Button, Chip, Icon, Spinner } from './ui'
import Markdown from './Markdown'

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
  if (rows.length === 0) return <p className="muted">This file is empty.</p>

  const [header, ...body] = rows
  const shown = body.slice(0, CSV_ROW_CAP)

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className="md-table">
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                {header.map((_, n) => (
                  <td key={n}>{r[n] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
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
          <p className="muted row" style={{ fontSize: 13, marginBottom: 12, gap: 6 }}>
            <Icon name="info" size={15} /> This file is large — only the beginning is shown.
            Download it for the rest.
          </p>
        )}
        {ext === 'md' ? (
          <Markdown source={preview.text} />
        ) : ext === 'csv' ? (
          <CsvTable text={preview.text} />
        ) : (
          <pre className="md-pre" style={{ whiteSpace: 'pre-wrap' }}>
            {preview.text}
          </pre>
        )}
      </>
    )
  }

  if (preview.kind === 'image') {
    return (
      <img
        src={preview.url}
        alt={name}
        style={{
          maxWidth: '100%',
          maxHeight: '72vh',
          objectFit: 'contain',
          borderRadius: 10,
          margin: '0 auto',
        }}
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
        style={{
          width: '100%',
          height: '74vh',
          border: 'none',
          borderRadius: 10,
          background: '#fff',
        }}
      />
    )
  }

  if (preview.kind === 'video') {
    return (
      <video
        src={preview.url}
        controls
        style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: 10, margin: '0 auto' }}
      />
    )
  }

  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <span
        className="empty__icon"
        style={{ margin: '0 auto', width: 64, height: 64, borderRadius: 16 }}
      >
        <Icon name="music" size={30} />
      </span>
      <audio
        src={preview.url}
        controls
        style={{ display: 'block', width: '100%', marginTop: 24 }}
      />
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

  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog card"
        role="dialog"
        aria-modal="true"
        aria-label={file.name}
        style={{ maxWidth: 1000 }}
      >
        <div
          className="row"
          style={{
            gap: 12,
            padding: '14px 16px 14px 20px',
            borderBottom: '1px solid var(--line-soft)',
          }}
        >
          <span
            className="row"
            style={{
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 10,
              background: look.bg,
              color: look.ink,
            }}
          >
            <Icon name={look.icon} size={20} />
          </span>
          <div className="grow">
            <div className="clamp-1" style={{ fontWeight: 600 }}>
              {file.name}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {formatBytes(file.sizeBytes)} · {new Date(file.uploadedAt).toLocaleDateString()}
            </div>
          </div>

          {files.length > 1 && (
            <div className="row" style={{ gap: 4 }}>
              <Button
                size="md"
                variant="ghost"
                iconOnly
                icon="chevronLeft"
                onClick={() => step(-1)}
                disabled={index === 0}
                aria-label="Previous file"
              />
              <span className="muted" style={{ fontSize: 13 }}>
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

        <div style={{ padding: 20, overflow: 'auto' }}>
          {isLoading ? (
            <Spinner label="Opening…" />
          ) : error || !data ? (
            <div className="empty">
              <span className="empty__icon">
                <Icon name="eyeOff" size={22} />
              </span>
              <div className="empty__title">
                {(error as Error | null)?.message ?? 'This file could not be opened.'}
              </div>
              <Chip size="sm">{extOf(file.name).toUpperCase() || 'FILE'}</Chip>
            </div>
          ) : (
            <Preview preview={data} name={file.name} />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
