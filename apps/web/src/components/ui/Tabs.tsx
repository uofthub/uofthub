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
}

function TabButtons<T extends string>({
  options,
  value,
  onChange,
  itemClass,
}: TabsProps<T> & { itemClass: string }) {
  return options.map((o) => {
    const selected = o.value === value
    return (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={selected}
        className={cx(itemClass, selected && `${itemClass}--on`)}
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
    <div role="tablist" aria-label={props.label} className={cx('seg-tabs', props.className)}>
      <TabButtons {...props} itemClass="seg-tab" />
    </div>
  )
}

/** Profile sections and the mobile feed: text tabs over a 3px navy rule. */
export function UnderlineTabs<T extends string>(props: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={props.label} className={cx('line-tabs', props.className)}>
      <TabButtons {...props} itemClass="line-tab" />
    </div>
  )
}
