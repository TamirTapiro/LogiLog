import { useState, useRef, useEffect, useMemo } from 'react'
import { FixedSizeList } from 'react-window'
import useStore from '../../store'
import type { AnomalyResult } from '../../types/analysis.types'
import type { LogEntry } from '../../types/log.types'
import { AnomalyCard } from './AnomalyCard'
import styles from './AnomalyList.module.css'

interface ItemData {
  anomalies: AnomalyResult[]
  entries: LogEntry[]
}

function SkeletonRow() {
  return <div className={styles.skeleton} />
}

export function AnomalyList() {
  const anomalies = useStore((s) => s.analysis.anomalies)
  const analysisStatus = useStore((s) => s.analysis.analysisStatus)
  const entries = useStore((s) => s.logs.entries)

  const [threshold, setThreshold] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(400)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setListHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const sorted = useMemo(() => [...anomalies].sort((a, b) => b.score - a.score), [anomalies])

  const filtered = useMemo(() => sorted.filter((a) => a.score >= threshold), [sorted, threshold])

  const itemData: ItemData = { anomalies: filtered, entries }
  const isLoading = analysisStatus === 'analyzing' || analysisStatus === 'embedding'

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <span className={styles.controlLabel}>threshold</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className={styles.slider}
        />
        <span className={styles.thresholdValue}>{threshold.toFixed(2)}</span>
      </div>

      <div ref={containerRef} className={styles.listWrapper}>
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : filtered.length === 0 && analysisStatus === 'done' ? (
          <div className={styles.emptyState}>
            <span>No anomalies above threshold {threshold.toFixed(2)}</span>
          </div>
        ) : (
          <FixedSizeList
            height={listHeight}
            width="100%"
            itemCount={filtered.length}
            itemSize={120}
            itemData={itemData}
          >
            {AnomalyCard}
          </FixedSizeList>
        )}
      </div>
    </div>
  )
}
