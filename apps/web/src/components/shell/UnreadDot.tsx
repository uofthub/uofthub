/** The red dot on the header's bell and inbox while something is unread. */
export function UnreadDot() {
  return (
    <span
      className="absolute top-2.25 right-2.5 box-content size-2 rounded-full border-2 border-surface bg-red"
      aria-hidden="true"
    />
  )
}
