/** The seven avatar fills from the boards, in the order they first appear. */
const FILLS = ['#0B6E6E', '#1E3765', '#1F5B34', '#6B2A70', '#8A3B12', '#2F4650', '#6B4B00']

/**
 * A person's colour. Keyed on their id so the same student is the same colour
 * in the header, on every card and on their own profile — the name alone would
 * give two different Maya Chens the same fill.
 */
export function avatarFill(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return FILLS[hash % FILLS.length]
}

/** "Maya Chen" → "MC", "Priya" → "P", nothing → "?". */
export function initials(name?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}
