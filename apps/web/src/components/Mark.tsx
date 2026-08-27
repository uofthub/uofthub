import { useId } from 'react'

/**
 * The uofthub mark, inline so its fills can be varied per placement.
 *
 * `brand` is the original navy artwork: the default, and what the light theme
 * shows. The dark theme switches to the white variant automatically via the
 * `.mark` class.
 *
 * `tone="white"` forces the white variant regardless of theme, for surfaces
 * that are navy in both — the drawer is #002554 against the artwork's #002658,
 * which is 1.02:1 and invisible.
 *
 * Kept in sync with src/assets/uofthub-mark.svg, which is still the source for
 * the favicons.
 */
export default function Mark({
  size = 34,
  tone = 'brand',
  className,
  title,
}: {
  size?: number
  /** `white` for navy or dark surfaces; `brand` (navy) everywhere else. */
  tone?: 'brand' | 'white'
  className?: string
  /** Give the mark an accessible name; omit it when the mark is decorative. */
  title?: string
}) {
  // Instances share a page (hero, footer, app bar), so the mask and clip ids
  // must be unique or the first instance's definitions win for all of them.
  const uid = useId().replace(/:/g, '')
  const clip = `uh-clip-${uid}`
  const slits = `u-slits-${uid}`
  const holes = `tower-holes-${uid}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="514 77 508 540"
      width={size}
      height={(size * 540) / 508}
      fill="none"
      className={['mark', tone === 'white' && 'mark--white', className].filter(Boolean).join(' ')}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title && <title>{title}</title>}

      <defs>
        {/* Outer U silhouette: trims the bottom of the tower to the curve */}
        <clipPath id={clip}>
          <path d="M514,60H1022V410C1022,534.2 920.4,617 768,617C615.6,617 514,534.2 514,410Z" />
        </clipPath>

        {/* Separation slits either side of the tower, plus the entrance arch.
            White keeps, black punches — these are mask channels, not theming. */}
        <mask id={slits} maskUnits="userSpaceOnUse" x="480" y="40" width="580" height="620">
          <rect x="480" y="40" width="580" height="620" fill="#FFFFFF" />
          <rect x="713" y="512" width="5" height="120" fill="#000000" />
          <rect x="818" y="512" width="5" height="120" fill="#000000" />
          <path d="M745,624V538A23,23 0 0 1 791,538V624Z" fill="#000000" />
        </mask>

        {/* Punches the windows and doorway out of the tower */}
        <mask id={holes} maskUnits="userSpaceOnUse" x="640" y="150" width="260" height="520">
          <rect x="640" y="150" width="260" height="520" fill="#FFFFFF" />
          <path d="M749.5,346V320A6,6 0 0 1 761.5,320V346Z" fill="#000000" />
          <path d="M774.5,346V320A6,6 0 0 1 786.5,320V346Z" fill="#000000" />
          <path d="M742.5,470V439.5A5.5,5.5 0 0 1 753.5,439.5V470Z" fill="#000000" />
          <path d="M762.5,470V439.5A5.5,5.5 0 0 1 773.5,439.5V470Z" fill="#000000" />
          <path d="M782.5,470V439.5A5.5,5.5 0 0 1 793.5,439.5V470Z" fill="#000000" />
          <path d="M745,624V538A23,23 0 0 1 791,538V624Z" fill="#000000" />
        </mask>
      </defs>

      {/* The U, split by two thin slits and joined at the bottom */}
      <g mask={`url(#${slits})`}>
        <path
          d="M514,153H663V440C663,477.6 710,508 768,508C826,508 873,477.6 873,440V273H1022V410C1022,534.2 920.4,617 768,617C615.6,617 514,534.2 514,410Z"
          fill="var(--mark-body)"
        />
      </g>

      {/* Bright accent block */}
      <path d="M840,77H917A105,105 0 0 1 1022,182V249H840Z" fill="var(--mark-accent)" />

      {/* Clock tower */}
      <g clipPath={`url(#${clip})`}>
        <g mask={`url(#${holes})`}>
          <path
            d="M741,287 C741,258 751,245 764.5,245 V213.5 A3.5,3.5 0 0 1 771.5,213.5 V245 C785,245 795,258 795,287 H805 A3,3 0 0 1 808,293 V306 H800 V347 H803 V352 H806 V363 H808 V366 H810 A8,8 0 0 1 818,374 V404 A8,8 0 0 1 810,412 H726 A8,8 0 0 1 718,404 V374 A8,8 0 0 1 726,366 H728 V363 H730 V352 H733 V347 H736 V306 H728 V293 A3,3 0 0 1 731,290 Z M725,414 H811 A2,2 0 0 1 813,416 V470 H818 V624 H718 V470 H723 V416 A2,2 0 0 1 725,414 Z"
            fill="var(--mark-body)"
            fillRule="evenodd"
          />
        </g>

        {/* Clock face, drawn after the mask so it is not punched out */}
        <circle cx="768" cy="386" r="20" fill="var(--mark-clock-face)" />
        <path
          d="M770.1,386V372.5H765.9V386ZM769,387.8L777.3,383.1L775.2,379.4L767,384.2Z"
          fill="var(--mark-clock-hand)"
        />
        <circle cx="768" cy="386" r="3.2" fill="var(--mark-clock-hand)" />
      </g>
    </svg>
  )
}
