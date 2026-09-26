import type { ProjectType, SectionKind } from '@uofthub/types'
import type { CourseTemplate } from '../../lib/api'
import { REFERENCE_KINDS, REFERENCE_KIND_KEYS } from '../../lib/references'
import { kindLabel, sectionLabel } from '../../lib/sections'
import { Button, Field, Input, Menu, MenuItem, Select, TextArea } from '../../components/ui'
import { move, newId, type DraftDetail, type DraftReference, type DraftSection } from './draft'

/**
 * The editor's list editors: sections, details and references. Each takes
 * its list and hands back a new one; the page owns the draft.
 */

function RowTools({
  index,
  count,
  label,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  label: string
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <div className="row" style={{ gap: 4 }}>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="chevronUp"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      />
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="chevronDown"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      />
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="close"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      />
    </div>
  )
}

/* --------------------------------- sections -------------------------------- */

const SECTION_KINDS: Exclude<SectionKind, 'custom'>[] = [
  'motivation',
  'method',
  'approaches',
  'data',
  'results',
  'examples',
  'considerations',
  'reflection',
  'conclusion',
]
const ITEM_KINDS = new Set<SectionKind>(['approaches', 'examples'])

export function SectionsEditor({
  sections,
  type,
  onChange,
}: {
  sections: DraftSection[]
  type: ProjectType | null
  onChange: (sections: DraftSection[]) => void
}) {
  const used = new Set(sections.map((s) => s.kind))
  const set = (i: number, patch: Partial<DraftSection>) =>
    onChange(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const add = (kind: SectionKind) =>
    onChange([
      ...sections,
      {
        id: newId('s'),
        kind,
        title: '',
        body: '',
        items: ITEM_KINDS.has(kind) ? [{ key: newId('i'), label: '', body: '' }] : [],
      },
    ])

  return (
    <div className="stack" style={{ gap: 16 }}>
      {sections.map((section, i) => {
        const heading = sectionLabel({ ...section, title: section.title }, type)
        const noun = section.kind === 'approaches' ? 'approach' : 'example'
        return (
          <div key={section.id} className="editor-block">
            <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
              <b className="editor-block__title">{heading}</b>
              <RowTools
                index={i}
                count={sections.length}
                label={heading}
                onMove={(by) => onChange(move(sections, i, by))}
                onRemove={() => onChange(sections.filter((_, j) => j !== i))}
              />
            </div>
            <Field
              label={section.kind === 'custom' ? 'Heading' : 'Heading (optional)'}
              hint={section.kind === 'custom' ? undefined : `Leave empty to use “${heading}”`}
            >
              <Input
                value={section.title}
                onChange={(e) => set(i, { title: e.target.value })}
                placeholder={section.kind === 'custom' ? 'e.g. Acknowledgements' : heading}
                maxLength={80}
              />
            </Field>
            <Field label="Text" hint="Markdown works. Left empty, this section won’t show.">
              <TextArea
                rows={5}
                value={section.body}
                onChange={(e) => set(i, { body: e.target.value })}
                placeholder={section.prompt}
              />
            </Field>
            {ITEM_KINDS.has(section.kind) && (
              <div className="stack" style={{ gap: 10 }}>
                {section.items.map((item, k) => (
                  <div key={item.key} className="editor-item">
                    <div className="row" style={{ gap: 8 }}>
                      <Input
                        aria-label={`Name of ${noun} ${k + 1}`}
                        value={item.label}
                        onChange={(e) =>
                          set(i, {
                            items: section.items.map((it, m) =>
                              m === k ? { ...it, label: e.target.value } : it
                            ),
                          })
                        }
                        placeholder={section.kind === 'approaches' ? 'e.g. Human baseline' : 'Name'}
                        maxLength={80}
                        className="grow"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon="close"
                        aria-label={`Remove ${noun} ${k + 1}`}
                        onClick={() =>
                          set(i, { items: section.items.filter((_, m) => m !== k) })
                        }
                      />
                    </div>
                    <TextArea
                      aria-label={`About ${item.label || `${noun} ${k + 1}`}`}
                      rows={3}
                      value={item.body}
                      onChange={(e) =>
                        set(i, {
                          items: section.items.map((it, m) =>
                            m === k ? { ...it, body: e.target.value } : it
                          ),
                        })
                      }
                      placeholder={item.prompt}
                    />
                  </div>
                ))}
                {section.items.length < 12 && (
                  <div>
                    <Button
                      size="sm"
                      icon="plus"
                      onClick={() =>
                        set(i, {
                          items: [...section.items, { key: newId('i'), label: '', body: '' }],
                        })
                      }
                    >
                      Add {section.kind === 'approaches' ? 'an approach' : 'an example'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {sections.length < 16 && (
        <div>
          <Menu
            width={240}
            trigger={({ toggle, open }) => (
              <Button icon="plus" onClick={toggle} aria-expanded={open}>
                Add a section
              </Button>
            )}
          >
            {(close) => (
              <>
                {SECTION_KINDS.filter((k) => !used.has(k)).map((k) => (
                  <MenuItem key={k} onSelect={() => add(k)} close={close}>
                    {kindLabel(k, type)}
                  </MenuItem>
                ))}
                <MenuItem onSelect={() => add('custom')} close={close}>
                  Something else…
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      )}
    </div>
  )
}

/* --------------------------------- details --------------------------------- */

export function DetailsEditor({
  details,
  onChange,
}: {
  details: DraftDetail[]
  onChange: (details: DraftDetail[]) => void
}) {
  const set = (i: number, patch: Partial<DraftDetail>) =>
    onChange(details.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  return (
    <div className="stack" style={{ gap: 8 }}>
      {details.map((d, i) => (
        <div key={d.key} className="row" style={{ gap: 8 }}>
          <Input
            aria-label={`Detail ${i + 1} label`}
            value={d.label}
            onChange={(e) => set(i, { label: e.target.value })}
            placeholder="Supervisor"
            maxLength={40}
            style={{ width: 170 }}
          />
          <Input
            aria-label={d.label ? d.label : `Detail ${i + 1} value`}
            value={d.value}
            onChange={(e) => set(i, { value: e.target.value })}
            placeholder={d.placeholder ?? 'Prof. Ada Lovelace'}
            maxLength={200}
            className="grow"
          />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon="close"
            aria-label={`Remove detail ${i + 1}`}
            onClick={() => onChange(details.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {details.length < 12 && (
        <div>
          <Button
            size="sm"
            icon="plus"
            onClick={() => onChange([...details, { key: newId('d'), label: '', value: '' }])}
          >
            Add a detail
          </Button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------- references ------------------------------- */

const emptyReference = (kind: DraftReference['kind']): DraftReference => ({
  key: newId('r'),
  kind,
  title: '',
  url: '',
  doi: '',
  authors: '',
  year: '',
  note: '',
})

export function ReferencesEditor({
  references,
  hint,
  onChange,
}: {
  references: DraftReference[]
  hint?: CourseTemplate['references']
  onChange: (references: DraftReference[]) => void
}) {
  const set = (i: number, patch: Partial<DraftReference>) =>
    onChange(references.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const suggested = hint?.kinds ?? ['DATASET', 'PAPER']
  return (
    <div className="stack" style={{ gap: 12 }}>
      {hint?.prompt && references.length === 0 && (
        <p className="muted" style={{ fontSize: 14 }}>
          {hint.prompt}
        </p>
      )}
      {references.map((r, i) => (
        <div key={r.key} className="editor-block">
          <div className="row" style={{ gap: 8 }}>
            <Select
              aria-label={`Reference ${i + 1} kind`}
              value={r.kind}
              onChange={(e) => set(i, { kind: e.target.value as DraftReference['kind'] })}
              style={{ width: 150 }}
            >
              {REFERENCE_KIND_KEYS.map((k) => (
                <option key={k} value={k}>
                  {REFERENCE_KINDS[k].label}
                </option>
              ))}
            </Select>
            <Input
              aria-label={`Reference ${i + 1} title`}
              value={r.title}
              onChange={(e) => set(i, { title: e.target.value })}
              placeholder="Title"
              maxLength={200}
              className="grow"
            />
            <RowTools
              index={i}
              count={references.length}
              label={r.title || `reference ${i + 1}`}
              onMove={(by) => onChange(move(references, i, by))}
              onRemove={() => onChange(references.filter((_, j) => j !== i))}
            />
          </div>
          <div className="editor-grid">
            <Input
              aria-label="Link"
              type="url"
              value={r.url}
              onChange={(e) => set(i, { url: e.target.value })}
              placeholder="Link (https://…)"
            />
            <Input
              aria-label="DOI"
              value={r.doi}
              onChange={(e) => set(i, { doi: e.target.value })}
              placeholder="DOI (10.…), if it has one"
            />
            <Input
              aria-label="Authors"
              value={r.authors}
              onChange={(e) => set(i, { authors: e.target.value })}
              placeholder="Authors"
              maxLength={200}
            />
            <Input
              aria-label="Year"
              inputMode="numeric"
              value={r.year}
              onChange={(e) => set(i, { year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              placeholder="Year"
            />
          </div>
          <Input
            aria-label="How you used it"
            value={r.note}
            onChange={(e) => set(i, { note: e.target.value })}
            placeholder="How you used it (optional) — e.g. the 2019 split, as a baseline"
            maxLength={280}
          />
        </div>
      ))}
      {references.length < 30 && (
        <div className="row wrap" style={{ gap: 8 }}>
          {suggested.map((k) => (
            <Button key={k} size="sm" icon="plus" onClick={() => onChange([...references, emptyReference(k)])}>
              Add a {REFERENCE_KINDS[k].label.toLowerCase()}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => onChange([...references, emptyReference('OTHER')])}>
            Something else
          </Button>
        </div>
      )}
    </div>
  )
}
