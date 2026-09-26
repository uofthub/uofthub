import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { API_URL } from './api'
import { useAuth } from './auth'

/** How long to wait before trying again after the server refused the stream. */
const REFUSED_RETRY_MS = 60_000

function refetchNotifications(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['notifications'] })
}

function refetchMessages(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['messages'] })
}

/**
 * Keep the bell and Messages current while signed in.
 *
 * One `GET /events` stream per tab (see api/src/lib/live.ts). Its events carry
 * no data — each one only says which queries are now stale, and React Query
 * refetches whichever of them are on screen.
 *
 * The browser reconnects a dropped stream by itself. Anything published while
 * it was down is lost, so every reconnect after the first refetches both. It
 * gives up only when the server refuses outright (a 401, or a 503 while the
 * database is unreachable); this tries again a minute later.
 */
export function useLiveUpdates() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  useEffect(() => {
    if (!userId || typeof EventSource === 'undefined') return
    let source: EventSource | null = null
    let retry: number | undefined
    let opened = false

    const connect = () => {
      source = new EventSource(`${API_URL}/events`, { withCredentials: true })
      source.addEventListener('open', () => {
        if (opened) {
          refetchNotifications(qc)
          refetchMessages(qc)
        }
        opened = true
      })
      source.addEventListener('notification', () => refetchNotifications(qc))
      source.addEventListener('message', () => refetchMessages(qc))
      source.addEventListener('resync', () => {
        refetchNotifications(qc)
        refetchMessages(qc)
      })
      source.addEventListener('error', () => {
        if (source?.readyState !== EventSource.CLOSED) return
        source.close()
        retry = window.setTimeout(connect, REFUSED_RETRY_MS)
      })
    }

    connect()
    return () => {
      window.clearTimeout(retry)
      source?.close()
    }
  }, [userId, qc])
}
