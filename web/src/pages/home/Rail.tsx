import type { ReactNode } from 'react'
import { cx } from '../../components/ui'

/** A feed side column: it rides along under the header as the feed scrolls. */
export function Rail({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <aside className={cx('sticky top-[calc(var(--spacing-header)+28px)] flex flex-col', className)}>
      {children}
    </aside>
  )
}
