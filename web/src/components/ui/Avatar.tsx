import { useState, type CSSProperties } from 'react'
import { cx } from './cx'
import { avatarFill, initials } from './people'

export type AvatarPerson = { id?: string; name?: string | null; avatarUrl?: string | null }

export function Avatar({
  person,
  size = 40,
  className,
  style,
}: {
  person: AvatarPerson
  size?: number
  className?: string
  style?: CSSProperties
}) {
  // A photo that fails to load (an expired signed URL, a deleted object) falls
  // back to initials rather than showing the browser's broken-image glyph.
  const [failed, setFailed] = useState(false)
  const img = person.avatarUrl && !failed ? person.avatarUrl : undefined

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-surface leading-none font-bold text-white',
        className
      )}
      style={{
        width: size,
        height: size,
        background: avatarFill(person.id ?? person.name ?? '?'),
        // The boards set 15px text in a 40px circle, 11px in 28px.
        fontSize: Math.max(10, Math.round(size * 0.375)),
        ...style,
      }}
      aria-hidden="true"
    >
      {img ? (
        <img src={img} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials(person.name)
      )}
    </span>
  )
}

/** Overlapping avatars for a project with more than one maker. */
export function AvatarStack({
  people,
  size = 40,
  max = 3,
}: {
  people: AvatarPerson[]
  size?: number
  max?: number
}) {
  return (
    <span className="flex">
      {people.slice(0, max).map((p, i) => (
        <Avatar
          key={p.id ?? i}
          person={p}
          size={size}
          style={i > 0 ? { marginLeft: -Math.round(size / 3) } : undefined}
        />
      ))}
    </span>
  )
}
