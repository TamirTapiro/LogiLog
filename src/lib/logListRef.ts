/**
 * Module-level singleton ref for the virtualized log list.
 * LogViewer registers the FixedSizeList ref here so that
 * useKeyboardNavigation can scroll without prop-drilling.
 */
import type { FixedSizeList } from 'react-window'

let listRef: FixedSizeList | null = null

export function registerLogListRef(ref: FixedSizeList | null): void {
  listRef = ref
}

export function getLogListRef(): FixedSizeList | null {
  return listRef
}
