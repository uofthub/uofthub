import type { ReactNode } from 'react'
import { cx } from './cx'
import { soonProps } from './soon'

export type TabOption<T extends string> = {
  value: T
  label: ReactNode
  soon?: boolean | string
}

type TabsProps<T extends string> = {
  options: TabOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
  /** Extra classes for every tab, like a smaller size. */
  itemClassName?: string
}

function TabButtons<T extends string>({
  options,
  value,
  onChange,
  item,
  itemClassName,
}: TabsProps<T> & { item: (selected: boolean) => string }) {
  return options.map((o) => {
    const selected = o.value === value
    return (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={selected}
        className={cx(item(selected), itemClassName)}
        {...(o.soon
          ? soonProps(typeof o.soon === 'string' ? o.soon : undefined)
          : { onClick: () => onChange(o.value) })}
      >
        {o.label}
      </button>
    )
  })
}

/** The home feed's switcher: a sunken track with a raised white selection. */
export function SegmentedTabs<T extends string>(props: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={props.label}
      className={cx('flex gap-1 rounded-xl bg-fill-soft p-1', props.className)}
    >
      <TabButtons
        {...props}
        item={(on) =>
          cx(
            'h-10 rounded-[9px] px-4.5 text-15 font-semibold whitespace-nowrap',
            on ? 'bg-surface text-ink shadow-raised' : 'text-ink-3'
          )
        }
      />
    </div>
  )
}

/** Profile sections and the mobile feed: text tabs over a 3px navy rule. */
export function UnderlineTabs<T extends string>(props: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={props.label}
      className={cx(
        'scrollbar-none flex gap-7 overflow-x-auto border-b border-line',
        props.className
      )}
    >
      <TabButtons
        {...props}
        item={(on) =>
          cx(
            'h-11 text-16 font-semibold whitespace-nowrap',
            on ? 'text-ink shadow-[inset_0_-3px_0_var(--color-navy)]' : 'text-muted'
          )
        }
      />
    </div>
  )
}
