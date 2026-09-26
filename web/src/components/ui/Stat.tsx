import type { ReactNode } from 'react'

/** A count in the display face over what it counts — "12 / Projects". */
export function Stat({
  value,
  label,
  onClick,
}: {
  value: ReactNode
  label: ReactNode
  /** Makes the stat a button — a count that opens the list it counts. */
  onClick?: () => void
}) {
  const body = (
    <>
      <div className="font-display text-24 font-bold">{value}</div>
      <div className="text-13 text-muted">{label}</div>
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="text-left text-ink hover:text-navy-ink">
      {body}
    </button>
  ) : (
    <div>{body}</div>
  )
}
