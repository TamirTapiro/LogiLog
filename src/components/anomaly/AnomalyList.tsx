import { useState, useRef, useEffect, useMemo } from 'react'
import { FixedSizeList } from 'react-window'
import useStore from '../../store'
import type { AnomalyResult } from '../../types/analysis.types'
import type { LogEntry } from '../../types/log.types'
import { AnomalyCard } from './AnomalyCard'
import { exportToJson, exportToCsv } from '../../lib/exportUtils'
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

  const handleExportJson = async () => {
    const data = filtered.map((a) => {
      const entry = entries.find((e) => e.id === a.logId)
      return {
        logId: a.logId,
        score: a.score,
        rank: a.rank,
        timestamp: entry ? new Date(entry.timestamp).toISOString() : null,
        level: entry?.level ?? null,
        source: entry?.source ?? null,
        message: entry?.message ?? null,
      }
    })
    await exportToJson(data, 'anomalies.json')
  }

  const handleExportCsv = async () => {
    const headers = ['logId', 'score', 'rank', 'timestamp', 'level', 'source', 'message']
    const rows = filtered.map((a) => {
      const entry = entries.find((e) => e.id === a.logId)
      return {
        logId: a.logId,
        score: a.score.toFixed(4),
        rank: a.rank,
        timestamp: entry ? new Date(entry.timestamp).toISOString() : '',
        level: entry?.level ?? '',
        source: entry?.source ?? '',
        message: entry?.message ?? '',
      }
    })
    await exportToCsv(rows, headers, 'anomalies.csv')
  }

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
        <button
          className={styles.exportBtn}
          onClick={handleExportJson}
          disabled={filtered.length === 0}
          aria-label="Export anomalies as JSON"
        >
          JSON
        </button>
        <button
          className={styles.exportBtn}
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
          aria-label="Export anomalies as CSV"
        >
          CSV
        </button>
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
