import { useSyncExternalStore } from 'react'

type ToastAction = { label: string; onClick: () => void }

export type ToastItem = {
  id: number
  message: string
  tone: 'plain' | 'error'
  action?: ToastAction
  leaving?: boolean
}

/** Long enough to read a short line; a toast with a button waits a little longer. */
export const SHOW_MS = 4000
export const SHOW_WITH_ACTION_MS = 6500
const LEAVE_MS = 150
/** More than this and they stop being a quiet aside. */
const MAX = 3

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit(next: ToastItem[]) {
  items = next
  listeners.forEach((l) => l())
}

export function dismiss(id: number) {
  if (!items.some((t) => t.id === id && !t.leaving)) return
  emit(items.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
  window.setTimeout(() => emit(items.filter((t) => t.id !== id)), LEAVE_MS)
}

/**
 * A short line at the bottom of the screen that goes away by itself — for
 * something that happened out of sight ("Link copied", "Project deleted").
 * Give it an `action` and it becomes a snackbar with one button, like "Undo".
 * Anything the student must read or decide belongs in a Notice or a dialog.
 */
export function toast(
  message: string,
  opts: { tone?: 'plain' | 'error'; action?: ToastAction } = {}
) {
  // The same line twice in a row (a double-click on Copy) shows once.
  const rest = items.filter((t) => t.message !== message)
  const item: ToastItem = { id: nextId++, message, tone: opts.tone ?? 'plain', action: opts.action }
  emit([...rest, item].slice(-MAX))
  return item.id
}

toast.error = (message: string) => toast(message, { tone: 'error' })

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => items
  )
}
