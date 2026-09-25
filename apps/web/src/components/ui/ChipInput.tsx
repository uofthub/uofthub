import { useState, type KeyboardEvent } from 'react'
import { Icon } from './Icon'
import { cx } from './cx'

/**
 * A short list typed one item at a time: Enter or a comma adds what is typed,
 * Backspace on an empty box takes the last one back. `normalize` shapes an
 * item (upper-casing a course code) and returns null to refuse it.
 */
export function ChipInput({
  value,
  onChange,
  max,
  maxLength,
  placeholder,
  normalize = (s) => s,
  label,
  id,
}: {
  value: string[]
  onChange: (next: string[]) => void
  max: number
  maxLength?: number
  placeholder?: string
  normalize?: (raw: string) => string | null
  label: string
  id?: string
}) {
  const [draft, setDraft] = useState('')
  const [refused, setRefused] = useState(false)
  const full = value.length >= max

  const add = () => {
    const raw = draft.trim().replace(/\s+/g, ' ')
    if (!raw) return
    const item = normalize(raw)
    if (!item) return setRefused(true)
    if (!value.some((v) => v.toLowerCase() === item.toLowerCase())) onChange([...value, item])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className={cx('inp', 'chip-input', refused && 'chip-input--bad')}>
      {value.map((v) => (
        <span key={v} className="chip-input__item">
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(value.filter((x) => x !== v))}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      {!full && (
        <input
          id={id}
          aria-label={label}
          value={draft}
          maxLength={maxLength}
          placeholder={value.length === 0 ? placeholder : 'Add another'}
          onChange={(e) => {
            setDraft(e.target.value)
            setRefused(false)
          }}
          onKeyDown={onKey}
          onBlur={add}
        />
      )}
    </div>
  )
}
