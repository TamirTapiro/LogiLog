import { useRef, useMemo, useEffect } from 'react'
import type { FixedSizeList } from 'react-window'
import useStore from '../store'
import type { LogEntry } from '../types/log.types'
import { registerLogListRef } from '../lib/logListRef'

function buildFilter(query: string): ((entry: LogEntry) => boolean) | null {
  if (!query) return null
  const regexMatch = query.match(/^\/(.+)\/([gimsuy]*)$/)
  if (regexMatch) {
    try {
      const re = new RegExp(regexMatch[1]!, regexMatch[2])
      return (entry) => re.test(entry.message)
    } catch {
      // fall through to plain string match
    }
  }
  const lower = query.toLowerCase()
  return (entry) => entry.message.toLowerCase().includes(lower)
}

export function useVirtualLog() {
  const listRef = useRef<FixedSizeList | null>(null)
  const entries = useStore((s) => s.logs.entries)
  const filteredIds = useStore((s) => s.logs.filteredIds)
  const searchQuery = useStore((s) => s.ui.searchQuery)

  // Keep the module-level singleton in sync with the current list instance
  // so useKeyboardNavigation can scroll without prop-drilling.
  useEffect(() => {
    registerLogListRef(listRef.current)
    return () => registerLogListRef(null)
  })

  const filteredEntries = useMemo(() => {
    let result = entries
    if (filteredIds !== null) {
      const idSet = new Set(filteredIds)
      result = result.filter((e) => idSet.has(e.id))
    }
    const predicate = buildFilter(searchQuery)
    if (predicate) {
      result = result.filter(predicate)
    }
    return result
  }, [entries, filteredIds, searchQuery])

  function scrollToIndex(index: number) {
    listRef.current?.scrollToItem(index, 'smart')
  }

  return { listRef, filteredEntries, scrollToIndex }
}
