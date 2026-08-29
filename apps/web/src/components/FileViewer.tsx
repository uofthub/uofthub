import { useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type FilePreview, type ProjectFile } from '../lib/api'
import { extOf, formatBytes, lookFor } from '../lib/files'
import { Btn, Chip, Icon, Spinner } from './ui'
import Markdown from './Markdown'

/**
 * The in-app document viewer.
 *
 * Files used to be download-only links, which meant leaving the page — and
 * trusting an unknown binary — just to see what a project actually contains.
 * Anything a browser can render is now rendered here instead, over the signed
 * URL the API hands back (see GET /projects/:id/files/:fileId/preview).
 */

/* ----------------------------------- CSV ----------------------------------- */

/** Rows a table preview draws before it stops and points at the download. */
const CSV_ROW_CAP = 200

/** Enough of RFC 4180 to survive quoted commas, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  // A trailing newline leaves one empty row behind; drop it rather than drawing
  // a blank line at the bottom of every table.
  return rows.filter(r => r.some(cell => cell !== ''))
}

function CsvTable({ text }: { text: string }) {
  const rows = parseCsv(text)
  if (rows.length === 0) return <p className="text--disabled">This file is empty.</p>

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
      <p className="text--disabled" style={{ fontSize: '0.8125rem', marginTop: 12 }}>
        {body.length > shown.length
          ? `Showing the first ${CSV_ROW_CAP} of ${body.length} rows — download the file for all of it.`
          : `${body.length} ${body.length === 1 ? 'row' : 'rows'}.`}
      </p>
    </>
  )
}

/* --------------------------------- Preview --------------------------------- */

function Preview({ preview, name }: { preview: FilePreview; name: string }) {
  if (preview.kind === 'text') {
    const ext = extOf(name)
    return (
      <>
        {preview.truncated && (
          <p className="text--disabled" style={{ fontSize: '0.8125rem', marginBottom: 12 }}>
            <Icon name="mdi-information-outline" size={15} /> This file is large — only the beginning is shown.
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
        style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 8 }}
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
        style={{ width: '100%', height: '74vh', border: 'none', borderRadius: 8, background: '#fff' }}
      />
    )
  }

  if (preview.kind === 'video') {
    return (
      <video src={preview.url} controls style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: 8 }} />
    )
  }

  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <Icon name="mdi-waveform" size={64} color="var(--tone-mint)" />
      <audio src={preview.url} controls style={{ display: 'block', width: '100%', marginTop: 24 }} />
    </div>
  )
}

/* ---------------------------------- Viewer --------------------------------- */

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
  const index = files.findIndex(f => f.id === fileId)
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
    <div className="v-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="v-dialog" style={{ maxWidth: 1000, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid var(--v-border-base)',
          }}
        >
          <Icon name={look.icon} size={24} color={`var(--tone-${look.color})`} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="overflow-ellipsis" style={{ fontWeight: 500 }}>
              {file.name}
            </div>
            <div className="text--disabled" style={{ fontSize: '0.75rem' }}>
              {formatBytes(file.sizeBytes)} · {new Date(file.uploadedAt).toLocaleDateString()}
            </div>
          </div>

          {files.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Btn icon onClick={() => step(-1)} disabled={index === 0} aria-label="Previous file">
                <Icon name="mdi-chevron-left" />
              </Btn>
              <span className="text--disabled" style={{ fontSize: '0.8125rem' }}>
                {index + 1} / {files.length}
              </span>
              <Btn icon onClick={() => step(1)} disabled={index === files.length - 1} aria-label="Next file">
                <Icon name="mdi-chevron-right" />
              </Btn>
            </div>
          )}

          <Btn variant="outlined" size="small" href={api.projects.downloadUrl(projectId, file.id)}>
            <Icon name="mdi-download-outline" size={16} />
            Download
          </Btn>
          <Btn icon onClick={onClose} aria-label="Close">
            <Icon name="mdi-close" />
          </Btn>
        </div>

        <div style={{ padding: 20, overflow: 'auto', textAlign: data?.kind === 'image' ? 'center' : undefined }}>
          {isLoading ? (
            <Spinner label="Opening…" />
          ) : error || !data ? (
            <div className="text--disabled" style={{ textAlign: 'center', padding: '48px 16px' }}>
              <Icon name="mdi-eye-off-outline" size={40} />
              <p style={{ marginTop: 12, color: 'inherit' }}>
                {(error as Error | null)?.message ?? 'This file could not be opened.'}
              </p>
              <Chip small color="grey" style={{ marginTop: 8 }}>
                {extOf(file.name).toUpperCase() || 'FILE'}
              </Chip>
            </div>
          ) : (
            <Preview preview={data} name={file.name} />
          )}
        </div>
      </div>
    </div>
  )
}
