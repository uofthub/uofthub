import type { ReactNode } from 'react'

/** A count in the display face over what it counts — "12 / Projects". */
export function Stat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div>
      <div className="font-display text-24 font-bold">{value}</div>
      <div className="text-13 text-muted">{label}</div>
    </div>
  )
}
