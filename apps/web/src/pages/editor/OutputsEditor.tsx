import { useState } from 'react'
import type { ProjectLink } from '@uofthub/types'
import { api, importedImageFile, type CourseTemplate, type ProjectFile } from '../../lib/api'
import { lookFor } from '../../lib/files'
import { useReleasedObjectUrls } from '../../lib/hooks'
import {
  OUTPUT_KINDS,
  OUTPUT_KIND_KEYS,
  outputKindForFile,
  outputKindForLink,
} from '../../lib/outputs'
import { makeThumbnail, thumbnailSource } from '../../lib/thumbnails'
import { Button, ErrorText, Icon, Input, Select } from '../../components/ui'
import { move, newId, type DraftOutput } from './draft'

/**
 * What the project produced, in order, with one of them leading. Each is a
 * file or a link; picking a file makes its thumbnail here in the browser (a
 * PDF's first page, a video frame, a large image scaled down), and any output
 * can have its thumbnail set or replaced by hand — which is also how a file
 * uploaded before thumbnails existed gets one. A link can take the preview
 * image its page advertises, fetched through the same link import as
 * "Start from a link"; it is offered, never done unasked.
 */

const targetName = (o: DraftOutput) => {
  switch (o.target.type) {
    case 'file':
      return o.target.name
    case 'newFile':
      return o.target.file.name
    case 'link':
    case 'newLink':
      return o.target.label || o.target.url
  }
}

export function OutputsEditor({
  outputs,
  hint,
  files,
  links,
  onChange,
  onUpdate,
}: {
  outputs: DraftOutput[]
  hint?: CourseTemplate['primaryOutput']
  /** The project's files and links that are not outputs yet. */
  files: ProjectFile[]
  links: ProjectLink[]
  onChange: (outputs: DraftOutput[]) => void
  /** Patch one output by key — for a thumbnail that finishes after the list moved on. */
  onUpdate: (key: string, patch: Partial<DraftOutput>) => void
}) {
  const [link, setLink] = useState({ label: '', url: '' })
  const [problem, setProblem] = useState<string | null>(null)
  // The output whose link preview is being fetched.
  const [fetching, setFetching] = useState<string | null>(null)

  useReleasedObjectUrls(outputs.map((o) => o.thumbnailUrl))
  const set = (i: number, patch: Partial<DraftOutput>) =>
    onChange(outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)))
  const hasPrimary = outputs.some((o) => o.primary)

  /** Make a thumbnail in the background; the output is usable meanwhile. */
  const thumbnailFor = (key: string, file: File, force = false) => {
    makeThumbnail(file, { force })
      .then((blob) => {
        if (blob) onUpdate(key, { thumbnail: blob, thumbnailUrl: URL.createObjectURL(blob) })
        else if (force) setProblem(`${file.name} couldn’t be made into a thumbnail`)
      })
      .catch(() => setProblem(`No thumbnail could be made from ${file.name}`))
  }

  /** The link's own preview image (og:image), made into its thumbnail. */
  const linkPreview = (key: string, url: string) => {
    setProblem(null)
    setFetching(key)
    api.projects
      .importLink(url)
      .then((got) => {
        if (got.image) thumbnailFor(key, importedImageFile(got.image), true)
        else setProblem('That link’s page has no preview image — set a thumbnail by hand')
      })
      .catch((e: Error) => setProblem(`No preview image from that link: ${e.message}`))
      .finally(() => setFetching(null))
  }

  const addFiles = (picked: File[]) => {
    const added = picked.map((file, n): DraftOutput => {
      const kind =
        n === 0 && !hasPrimary && hint ? hint.kind : outputKindForFile(file.name)
      const preview = thumbnailSource(file) === 'image' ? URL.createObjectURL(file) : undefined
      return {
        key: newId('o'),
        kind,
        label: '',
        primary: n === 0 && !hasPrimary,
        target: { type: 'newFile', file },
        thumbnailUrl: preview,
      }
    })
    onChange([...outputs, ...added])
    added.forEach((o) => o.target.type === 'newFile' && thumbnailFor(o.key, o.target.file))
  }

  const addLink = () => {
    const url = link.url.trim()
    if (!url) return
    const label = link.label.trim()
    onChange([
      ...outputs,
      {
        key: newId('o'),
        kind: outputKindForLink({ label, url }),
        label: '',
        primary: !hasPrimary,
        target: { type: 'newLink', label, url },
      },
    ])
    setLink({ label: '', url: '' })
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {hint && outputs.length === 0 && (
        <p className="muted" style={{ fontSize: 14 }}>
          {hint.prompt}
        </p>
      )}

      {outputs.map((o, i) => {
        const look = lookFor(targetName(o))
        const name = targetName(o)
        return (
          <div key={o.key} className="editor-output">
            <span className="editor-output__thumb" style={{ background: look.bg, color: look.ink }}>
              {o.thumbnailUrl && o.thumbnail !== 'remove' ? (
                <img src={o.thumbnailUrl} alt="" />
              ) : (
                <Icon name={OUTPUT_KINDS[o.kind].icon} size={20} />
              )}
            </span>
            <div className="stack grow" style={{ gap: 8, minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <Select
                  aria-label={`What ${name} is`}
                  value={o.kind}
                  onChange={(e) => set(i, { kind: e.target.value as DraftOutput['kind'] })}
                  style={{ width: 130 }}
                >
                  {OUTPUT_KIND_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {OUTPUT_KINDS[k].label}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`Label for ${name}`}
                  value={o.label}
                  onChange={(e) => set(i, { label: e.target.value })}
                  placeholder={OUTPUT_KINDS[o.kind].label}
                  maxLength={80}
                  className="grow"
                  style={{ minWidth: 140 }}
                />
              </div>
              <span className="muted clamp-1" style={{ fontSize: 13 }}>
                {name}
              </span>
              <div className="row wrap" style={{ gap: 12, fontSize: 13 }}>
                <label className="row" style={{ gap: 6 }}>
                  <input
                    type="radio"
                    name="primary-output"
                    checked={o.primary}
                    onChange={() => onChange(outputs.map((x, j) => ({ ...x, primary: j === i })))}
                  />
                  Lead with this
                </label>
                <label className="link-btn">
                  {o.thumbnailUrl && o.thumbnail !== 'remove' ? 'Replace thumbnail' : 'Set a thumbnail'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) thumbnailFor(o.key, file, true)
                    }}
                  />
                </label>
                {(o.target.type === 'link' || o.target.type === 'newLink') &&
                  !(o.thumbnailUrl && o.thumbnail !== 'remove') && (
                    <button
                      type="button"
                      className="link-btn"
                      disabled={fetching === o.key}
                      onClick={() => linkPreview(o.key, (o.target as { url: string }).url)}
                    >
                      {fetching === o.key ? 'Fetching the preview…' : 'Use the link’s preview image'}
                    </button>
                  )}
                {o.thumbnailUrl && o.thumbnail !== 'remove' && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      // A saved thumbnail is removed on save; an unsaved one just goes.
                      set(i, o.id ? { thumbnail: 'remove' } : { thumbnail: undefined, thumbnailUrl: undefined })
                    }
                  >
                    Remove thumbnail
                  </button>
                )}
              </div>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="chevronUp"
                aria-label={`Move ${name} up`}
                disabled={i === 0}
                onClick={() => onChange(move(outputs, i, -1))}
              />
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="chevronDown"
                aria-label={`Move ${name} down`}
                disabled={i === outputs.length - 1}
                onClick={() => onChange(move(outputs, i, 1))}
              />
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="close"
                aria-label={`Remove ${name} from outputs`}
                onClick={() => onChange(outputs.filter((_, j) => j !== i))}
              />
            </div>
          </div>
        )
      })}

      {outputs.length < 20 && (
        <>
          <label className="dropzone">
            <span className="dropzone__icon">
              <Icon name="upload" size={20} />
            </span>
            <span className="grow">
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>
                Add a file as an output
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                A poster, slides, a paper, a recording. A PDF’s first page becomes its thumbnail.
              </span>
            </span>
            <span className="btn btn--md">Browse files</span>
            <input
              type="file"
              multiple
              accept={hint?.accept}
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                e.target.value = ''
                addFiles(picked.slice(0, 20 - outputs.length))
              }}
            />
          </label>
          <form
            className="row wrap"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              addLink()
            }}
          >
            <Input
              aria-label="Link label"
              value={link.label}
              onChange={(e) => setLink((l) => ({ ...l, label: e.target.value }))}
              placeholder="Label, e.g. Recording"
              style={{ width: 180 }}
            />
            <Input
              aria-label="Link to add as an output"
              type="url"
              value={link.url}
              onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))}
              placeholder="https://"
              className="grow"
              style={{ minWidth: 200 }}
            />
            <Button type="submit" icon="link" disabled={!link.url.trim()}>
              Add link
            </Button>
          </form>
          {(files.length > 0 || links.length > 0) && (
            <Select
              aria-label="Use something already uploaded"
              value=""
              onChange={(e) => {
                const [type, id] = e.target.value.split(':')
                const file = type === 'file' ? files.find((f) => f.id === id) : undefined
                const saved = type === 'link' ? links.find((l) => l.id === id) : undefined
                if (!file && !saved) return
                onChange([
                  ...outputs,
                  {
                    key: newId('o'),
                    kind: file ? outputKindForFile(file.name) : outputKindForLink(saved!),
                    label: '',
                    primary: !hasPrimary,
                    target: file
                      ? { type: 'file', fileId: file.id, name: file.name }
                      : { type: 'link', linkId: saved!.id, label: saved!.label, url: saved!.url },
                  },
                ])
              }}
            >
              <option value="">Use something already on the project…</option>
              {files.map((f) => (
                <option key={f.id} value={`file:${f.id}`}>
                  {f.name}
                </option>
              ))}
              {links.map((l) => (
                <option key={l.id} value={`link:${l.id}`}>
                  {l.label || l.url}
                </option>
              ))}
            </Select>
          )}
        </>
      )}
      {problem && <ErrorText>{problem}</ErrorText>}
    </div>
  )
}
