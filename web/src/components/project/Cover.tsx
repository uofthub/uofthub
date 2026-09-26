import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../ui'
import { coverPalette } from './palette'

/**
 * The media area at the top of every card. An uploaded image when there is
 * one; otherwise a cover set from the title in the design's display face.
 * Most projects have no image, so the fallback is most of what anyone sees and
 * gets the care that implies.
 *
 * `children` are the overlays the boards float on a cover: "Live demo", a
 * play button, a runtime.
 */
export function Cover({
  project,
  height,
  radius = 0,
  children,
  style,
}: {
  project: { id: string; title: string; coverUrl?: string }
  height: number
  radius?: number
  children?: ReactNode
  style?: CSSProperties
}) {
  const frame = 'relative shrink-0 overflow-hidden'
  const size: CSSProperties = { height, borderRadius: radius, ...style }

  if (project.coverUrl) {
    return (
      <div className={frame} style={size}>
        <img
          src={project.coverUrl}
          alt=""
          loading="lazy"
          className="size-full bg-fill object-cover"
        />
        {children}
      </div>
    )
  }

  const p = coverPalette(project.id)
  // Thumbnails are too small to set a title in; they get its initial instead.
  const small = height < 120
  const title = project.title.trim() || 'Untitled'

  return (
    <div className={frame} style={size} data-cover="generated">
      <svg
        viewBox="0 0 640 360"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        aria-hidden="true"
      >
        <rect width="640" height="360" fill={p.ground} />
        <circle cx="540" cy="70" r="150" fill={p.shape} />
        <circle cx="96" cy="340" r="84" fill={p.shape} opacity="0.7" />
        <g fill={p.ink} opacity="0.16">
          {[0, 1, 2, 3, 4].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <circle key={`${row}-${col}`} cx={380 + col * 44} cy={200 + row * 32} r="3" />
            ))
          )}
        </g>
        {small && (
          <text
            x="320"
            y="228"
            textAnchor="middle"
            fontFamily="Bricolage Grotesque, sans-serif"
            fontWeight="800"
            fontSize="170"
            fill={p.ink}
          >
            {title[0].toUpperCase()}
          </text>
        )}
      </svg>
      {!small && (
        <span
          className="absolute right-[34%] bottom-4.5 left-5.5 line-clamp-2 font-display text-26 leading-[1.08] font-extrabold tracking-tighter"
          style={{ color: p.ink }}
        >
          {title}
        </span>
      )}
      {children}
    </div>
  )
}

/** The white rounded tag in a cover's corner — "Live demo", "PDF · 14 pages". */
export function CoverTag({
  icon,
  children,
  className,
}: {
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'absolute bottom-3 left-3 flex h-6.5 items-center gap-1.5 rounded-full bg-white/94 px-2.5 text-12 font-semibold text-[#15171c]',
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}
