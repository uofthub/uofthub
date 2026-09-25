/**
 * The tints the boards' cover illustrations are drawn in — a light ground, a
 * slightly deeper shape, and an ink for anything written on it. The last is
 * the dark "Night Shift" poster, kept so a feed of generated covers is not
 * uniformly pastel.
 */
export const COVER_PALETTES = [
  { ground: '#DDE4F0', shape: '#C9D3E6', ink: '#1E3765' },
  { ground: '#E3EEE6', shape: '#D2E3D6', ink: '#1F5B34' },
  { ground: '#EFE3F0', shape: '#E3CDE5', ink: '#6B2A70' },
  { ground: '#FBEFD0', shape: '#F4DFA6', ink: '#6B4B00' },
  { ground: '#F6E7E1', shape: '#EDD3C8', ink: '#8A3B12' },
  { ground: '#E4EAEC', shape: '#CFDADE', ink: '#2F4650' },
  { ground: '#1B1D22', shape: '#272A31', ink: '#F2C14E' },
] as const

/**
 * A project's palette, from its id — so a project keeps the same cover on
 * every visit and on every page it appears on, where a random pick would make
 * the feed repaint differently on each render.
 */
export function coverPalette(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return COVER_PALETTES[hash % COVER_PALETTES.length]
}
