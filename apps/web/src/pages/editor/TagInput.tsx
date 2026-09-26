import { useState } from 'react'
import { Chip, cx, Icon, inputClass } from '../../components/ui'

/** Tags as chips: Enter or a comma adds one, Backspace on an empty box removes the last. */
export function TagInput({
  value,
  onChange,
  max = 5,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  max?: number
}) {
  const [draft, setDraft] = useState('')
  const full = value.length >= max

  const add = (...raws: string[]) => {
    const next = [...value]
    for (const raw of raws) {
      const tag = raw.trim().replace(/^#/, '')
      if (tag && next.length < max && !next.some((t) => t.toLowerCase() === tag.toLowerCase()))
        next.push(tag)
    }
    if (next.length !== value.length) onChange(next)
  }

  return (
    <div
      className={cx(
        inputClass,
        'flex h-auto min-h-11 flex-wrap items-center gap-1.5 px-2.5 py-1.5',
        'focus-within:border-navy-ink focus-within:outline-2 focus-within:outline-navy-soft'
      )}
    >
      {value.map((t) => (
        <Chip key={t} size="sm" tone="navy">
          {t}
          <button
            type="button"
            className="flex"
            aria-label={`Remove ${t}`}
            onClick={() => onChange(value.filter((x) => x !== t))}
          >
            <Icon name="close" size={12} />
          </button>
        </Chip>
      ))}
      <input
        className="h-7.5 min-w-20 flex-[1_1_80px] bg-transparent px-0.5 text-15 outline-none"
        value={draft}
        disabled={full}
        placeholder={full ? '' : value.length ? 'Add another' : `Add up to ${max}`}
        aria-label="Tags"
        onChange={(e) => {
          const v = e.target.value
          if (v.includes(',')) {
            add(...v.split(',').slice(0, -1))
            setDraft(v.split(',').pop() ?? '')
          } else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
            setDraft('')
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => {
          add(draft)
          setDraft('')
        }}
      />
    </div>
  )
}
