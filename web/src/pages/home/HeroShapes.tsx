import { useEffect, useRef } from 'react'

/*
 * The landing page's floating outlines, restored as they were (ported from
 * Home.vue's SCSS). Each shape is a ring with two companions — a filled bar
 * and an outlined box — that drift on their own slower cycle.
 *
 * Positions are in vw/vh, so the layer is a full viewport-sized coordinate
 * space, anchored to the hero's top and re-centred on the viewport so the
 * hero's padding and max-width don't shift the shapes sideways.
 */

/** [x in vw, y in vh, rotation in deg] */
type Place = readonly [number, number, number?]

type Shape = {
  colour: string
  /** The ring's diameter, px. */
  ring: number
  /** Where the ring starts, is halfway, and ends up. */
  path: readonly [Place, Place, Place]
  /** The filled bar: width, height, and where it starts. */
  bar: readonly [number, number, Place]
  /** The outlined box: width, height, and where it starts. */
  box: readonly [number, number, Place]
  /** Where the bar and box are a third of the way, and at the end. */
  drift: readonly [Place, Place]
}

const SHAPES: Shape[] = [
  {
    colour: '#7e57c2',
    ring: 10,
    path: [
      [11, 27],
      [5, 15],
      [26, 13],
    ],
    bar: [140, 9, [-11, 20, 171]],
    box: [17, 63, [-16, -3, 278]],
    drift: [
      [35, -25, 295],
      [29, 2, 54],
    ],
  },
  {
    colour: '#1e88e5',
    ring: 55,
    path: [
      [64, 10],
      [48, 17],
      [57, 15],
    ],
    bar: [192, 106, [1, -43, 298]],
    box: [16, 88, [-28, 29, 157]],
    drift: [
      [-30, -14, 40],
      [-8, 26, 108],
    ],
  },
  {
    colour: '#1b74c2',
    ring: 52,
    path: [
      [69, 34],
      [92, 36],
      [76, 29],
    ],
    bar: [226, 121, [-6, 33, 107]],
    box: [76, 50, [11, -19, 212]],
    drift: [
      [-22, 18, 320],
      [6, -30, 75],
    ],
  },
  {
    colour: '#bf1537',
    ring: 27,
    path: [
      [15, 67],
      [13, 51],
      [5, 64],
    ],
    bar: [93, 181, [24, 40, 58]],
    box: [41, 107, [-9, 55, 139]],
    drift: [
      [12, 22, 190],
      [31, 8, 12],
    ],
  },
  {
    colour: '#d89648',
    ring: 40,
    path: [
      [51, 61],
      [55, 67],
      [65, 90],
    ],
    bar: [54, 161, [-32, 12, 244]],
    box: [109, 29, [-12, 47, 31]],
    drift: [
      [-14, 36, 88],
      [-38, 5, 266],
    ],
  },
  {
    colour: '#78ffba',
    ring: 17,
    path: [
      [76, 77],
      [84, 84],
      [75, 63],
    ],
    bar: [117, 46, [-25, -34, 126]],
    box: [62, 81, [9, -12, 19]],
    drift: [
      [4, -20, 210],
      [-18, -46, 340],
    ],
  },
]

const at = ([x, y, deg]: Place) =>
  `translate3d(${x}vw, ${y}vh, 0)${deg === undefined ? '' : ` rotate(${deg}deg)`}`

const cycle = (duration: number): KeyframeAnimationOptions => ({
  duration: duration * 1000,
  iterations: Infinity,
  direction: 'alternate',
  easing: 'linear',
})

const piece = 'absolute top-0 left-0 origin-top border-2 opacity-90'

function Drifting({ shape }: { shape: Shape }) {
  const ring = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const [start, mid, end] = shape.path
    const [third, last] = shape.drift
    const running = [
      ring.current?.animate?.(
        [{ transform: at(start) }, { transform: at(mid), offset: 0.5 }, { transform: at(end) }],
        cycle(150)
      ),
      ...[
        [bar.current, shape.bar[2]],
        [box.current, shape.box[2]],
      ].map(([el, from]) =>
        (el as HTMLElement | null)?.animate?.(
          [
            { transform: at(from as Place) },
            { transform: at(third), offset: 0.33 },
            { transform: at(last) },
          ],
          cycle(180)
        )
      ),
    ]
    return () => running.forEach((a) => a?.cancel())
  }, [shape])

  const { colour } = shape
  return (
    <span
      ref={ring}
      className={`${piece} rounded-full`}
      style={{
        width: shape.ring,
        height: shape.ring,
        borderColor: colour,
        transform: at(shape.path[0]),
      }}
    >
      <span
        ref={bar}
        className={piece}
        style={{
          width: shape.bar[0],
          height: shape.bar[1],
          borderColor: colour,
          background: colour,
          transform: at(shape.bar[2]),
        }}
      />
      <span
        ref={box}
        className={piece}
        style={{
          width: shape.box[0],
          height: shape.box[1],
          borderColor: colour,
          transform: at(shape.box[2]),
        }}
      />
    </span>
  )
}

/**
 * The drifting shapes behind the landing hero, from laptop width up (1024px).
 * On a phone or a tablet they cross the heading and the buttons, so those —
 * and anybody who asks for less motion — get the calm version.
 */
export function HeroShapes() {
  return (
    <div
      className="pointer-events-none absolute top-0 left-1/2 z-0 hidden h-screen w-screen -translate-x-1/2 overflow-hidden motion-safe:lg:block"
      aria-hidden="true"
    >
      {SHAPES.map((s) => (
        <Drifting key={s.colour} shape={s} />
      ))}
    </div>
  )
}
