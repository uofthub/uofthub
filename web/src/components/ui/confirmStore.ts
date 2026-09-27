import { useSyncExternalStore, type ReactNode } from 'react'

type Ask = {
  title: ReactNode
  body?: ReactNode
  /** Says what happens: "Delete project", not "OK". */
  confirmLabel: string
  cancelLabel?: string
  /** For what can't be taken back. Focus starts on Cancel. */
  danger?: boolean
}

let pending: (Ask & { resolve: (yes: boolean) => void }) | null = null
const listeners = new Set<() => void>()

export function settle(yes: boolean) {
  const p = pending
  pending = null
  listeners.forEach((l) => l())
  p?.resolve(yes)
}

/**
 * Ask before doing something that is hard to undo. Resolves true when the
 * student goes ahead, false on Cancel, Escape or a click outside:
 *
 *   onClick={async () => (await confirmAction({...})) && remove.mutate()}
 */
export function confirmAction(ask: Ask): Promise<boolean> {
  // A second question replaces the first, which counts as a no.
  if (pending) settle(false)
  return new Promise((resolve) => {
    pending = { ...ask, resolve }
    listeners.forEach((l) => l())
  })
}

export function usePending() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pending
  )
}
