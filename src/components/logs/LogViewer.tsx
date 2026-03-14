import { useRef, useEffect, useState } from 'react'
import { FixedSizeList } from 'react-window'
import useStore from '../../store'
import { useVirtualLog } from '../../hooks/useVirtualLog'
import { LogRow } from './LogRow'
import { LogSearch } from './LogSearch'
import styles from './LogViewer.module.css'

export function LogViewer() {
  const anomalies = useStore((s) => s.analysis.anomalies)
  const { listRef, filteredEntries, scrollToIndex: _scrollToIndex } = useVirtualLog()
  const containerRef = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(400)

  const anomalyMap = new Map(anomalies.map((a) => [a.logId, a.score]))

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setListHeight(entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={styles.container}>
      <LogSearch />
      <div className={styles.listWrapper} ref={containerRef}>
        {filteredEntries.length > 0 && (
          <FixedSizeList
            ref={listRef}
            height={listHeight}
            width="100%"
            itemCount={filteredEntries.length}
            itemSize={20}
            itemData={{ entries: filteredEntries, anomalyMap }}
          >
            {LogRow}
          </FixedSizeList>
        )}
        {filteredEntries.length === 0 && (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            No log entries to display.
          </div>
        )}
      </div>
    </div>
  )
}
