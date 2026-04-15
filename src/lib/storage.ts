import type { HistoryEntry } from './types'

const HISTORY_KEY = 'eml-repl-history-v1'
const MAX_HISTORY = 16

export function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = sessionStorage.getItem(HISTORY_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as HistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHistory(entries: HistoryEntry[]) {
  if (typeof window === 'undefined') {
    return
  }

  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
}

export function pushHistory(
  current: HistoryEntry[],
  nextEntry: HistoryEntry,
): HistoryEntry[] {
  const deduped = current.filter((entry) => entry.emlText !== nextEntry.emlText)
  return [nextEntry, ...deduped].slice(0, MAX_HISTORY)
}
