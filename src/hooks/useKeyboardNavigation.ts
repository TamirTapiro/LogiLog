import { useEffect, useState } from 'react'
import useStore from '../store'
import { getLogListRef } from '../lib/logListRef'

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = (el as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function useKeyboardNavigation(): {
  showShortcuts: boolean
  setShowShortcuts: React.Dispatch<React.SetStateAction<boolean>>
} {
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isEditableTarget(document.activeElement)) return

      const state = useStore.getState()
      const { logs, analysis, ui } = state
      const entryCount = logs.entries.length

      // Determine the filtered entry list length for bounds checking.
      // We keep it simple: use the store's raw entries length because the
      // keyboard hook doesn't know about the current filter predicate. For
      // the common case (no filter active) this is correct. When a filter IS
      // active the worst case is we try to scroll past the end, which
      // react-window handles gracefully by clamping.
      const maxIndex = Math.max(0, entryCount - 1)
      const currentIndex = ui.focusedRowIndex

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault()
          const next = Math.min(currentIndex + 1, maxIndex)
          state.setFocusedRowIndex(next)
          getLogListRef()?.scrollToItem(next, 'smart')
          break
        }

        case 'k':
        case 'ArrowUp': {
          e.preventDefault()
          const prev = Math.max(currentIndex - 1, 0)
          state.setFocusedRowIndex(prev)
          getLogListRef()?.scrollToItem(prev, 'smart')
          break
        }

        case 'g': {
          e.preventDefault()
          state.setFocusedRowIndex(0)
          getLogListRef()?.scrollToItem(0, 'start')
          break
        }

        case 'G': {
          // Shift+g
          e.preventDefault()
          state.setFocusedRowIndex(maxIndex)
          getLogListRef()?.scrollToItem(maxIndex, 'end')
          break
        }

        case 'Enter': {
          const focusedEntry = logs.entries[currentIndex]
          if (focusedEntry !== undefined) {
            state.selectLog(focusedEntry.id)
          }
          break
        }

        case 'n': {
          if (e.shiftKey) {
            // N → previous anomaly
            e.preventDefault()
            const anomalies = analysis.anomalies
            if (anomalies.length === 0) break
            const currentLogId = ui.selectedLogId
            const currentAnomalyIdx = anomalies.findIndex((a) => a.logId === currentLogId)
            const prevIdx = currentAnomalyIdx <= 0 ? anomalies.length - 1 : currentAnomalyIdx - 1
            const prevAnomaly = anomalies[prevIdx]
            if (prevAnomaly !== undefined) {
              state.selectLog(prevAnomaly.logId)
              const entryIdx = logs.entries.findIndex((e) => e.id === prevAnomaly.logId)
              if (entryIdx !== -1) {
                state.setFocusedRowIndex(entryIdx)
                getLogListRef()?.scrollToItem(entryIdx, 'smart')
              }
            }
          } else {
            // n → next anomaly
            e.preventDefault()
            const anomalies = analysis.anomalies
            if (anomalies.length === 0) break
            const currentLogId = ui.selectedLogId
            const currentAnomalyIdx = anomalies.findIndex((a) => a.logId === currentLogId)
            const nextIdx =
              currentAnomalyIdx === -1 || currentAnomalyIdx >= anomalies.length - 1
                ? 0
                : currentAnomalyIdx + 1
            const nextAnomaly = anomalies[nextIdx]
            if (nextAnomaly !== undefined) {
              state.selectLog(nextAnomaly.logId)
              const entryIdx = logs.entries.findIndex((e) => e.id === nextAnomaly.logId)
              if (entryIdx !== -1) {
                state.setFocusedRowIndex(entryIdx)
                getLogListRef()?.scrollToItem(entryIdx, 'smart')
              }
            }
          }
          break
        }

        case '/': {
          e.preventDefault()
          document.getElementById('log-search-input')?.focus()
          break
        }

        case 'Escape': {
          state.setSearchQuery('')
          state.selectLog(null)
          break
        }

        case '1': {
          e.preventDefault()
          state.setActivePanel('timeline')
          break
        }

        case '2': {
          e.preventDefault()
          state.setActivePanel('logs')
          break
        }

        case '3': {
          e.preventDefault()
          state.setActivePanel('clusters')
          break
        }

        case '4': {
          e.preventDefault()
          state.setActivePanel('anomalies')
          break
        }

        case '?': {
          e.preventDefault()
          setShowShortcuts((prev) => !prev)
          break
        }

        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return { showShortcuts, setShowShortcuts }
}
