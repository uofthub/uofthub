import { cx } from './cx'

export type ButtonVariant = 'default' | 'primary' | 'gold' | 'ghost' | 'danger'
/** lg is the design's 44px default; md is the 40px in-card size; sm is 36px. */
export type ButtonSize = 'lg' | 'md' | 'sm'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn border border-line-strong bg-surface font-semibold text-ink no-underline transition-[background-color,border-color] duration-120 hover:bg-fill-warm hover:text-ink disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55'

const VARIANT: Record<ButtonVariant, string> = {
  default: '',
  primary:
    'border-navy-ink bg-navy text-white hover:border-navy-deep hover:bg-navy-deep hover:text-white',
  gold: 'border-gold bg-gold text-[#15171c] hover:bg-gold-hover hover:text-[#15171c]',
  ghost: 'border-transparent bg-transparent',
  danger: 'text-red hover:text-red',
}

const SIZE: Record<ButtonSize, string> = {
  lg: 'h-11 px-4.5 text-15',
  md: 'h-10 px-3.5 text-14',
  sm: 'h-9 px-3.5 text-14',
}

/** Icon-only widths. A small one keeps the full 44px width: a wider target than its height. */
const ICON_ONLY: Record<ButtonSize, string> = {
  lg: 'w-11 px-0',
  md: 'w-10 px-0',
  sm: 'w-11 px-0',
}

/** The classes of a Button, for the rare control that has to be some other element. */
export function buttonClass({
  variant = 'default',
  size = 'lg',
  iconOnly,
  block,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  iconOnly?: boolean
  block?: boolean
  className?: string
} = {}) {
  return cx(
    BASE,
    SIZE[size],
    VARIANT[variant],
    iconOnly && ICON_ONLY[size],
    block && 'w-full',
    className
  )
}
