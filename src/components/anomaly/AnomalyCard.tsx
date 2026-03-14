import type { ListChildComponentProps } from 'react-window'
import type { AnomalyResult } from '../../types/analysis.types'
import type { LogEntry } from '../../types/log.types'
import useStore from '../../store'
import { useVirtualLog } from '../../hooks/useVirtualLog'
import styles from './AnomalyCard.module.css'

interface ItemData {
  anomalies: AnomalyResult[]
  entries: LogEntry[]
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 23)
}

function getMeterClass(score: number): string {
  if (score > 0.5) return styles.meterFillRed
  if (score >= 0.35) return styles.meterFillAmber
  return styles.meterFillGreen
}

export function AnomalyCard({ index, style, data }: ListChildComponentProps<ItemData>) {
  const { anomalies, entries } = data
  const anomaly = anomalies[index]!
  const entry = entries.find((e) => e.id === anomaly.logId)
  const selectLog = useStore((s) => s.selectLog)
  const { scrollToIndex, filteredEntries } = useVirtualLog()

  if (!entry) return <div style={style} className={styles.card} />

  const message = entry.message.length > 120 ? entry.message.slice(0, 120) + '…' : entry.message
  const fillPct = Math.round(anomaly.score * 100)
  const meterClass = getMeterClass(anomaly.score)

  function handleViewContext() {
    selectLog(anomaly.logId)
  }

  function handleJump() {
    const idx = filteredEntries.findIndex((e) => e.id === anomaly.logId)
    if (idx !== -1) scrollToIndex(idx)
  }

  return (
    <div style={style} className={styles.card}>
      <div className={styles.header}>
        <span className={styles.rank}>#{anomaly.rank}</span>
        <div className={styles.meta}>
          <span className={styles.source}>{entry.source}</span>
          <span className={styles.timestamp}>{formatTimestamp(entry.timestamp)}</span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.btn}
            onClick={handleViewContext}
            aria-label={`View context for anomaly #${anomaly.rank}`}
          >
            View Context
          </button>
          <button
            className={styles.btn}
            onClick={handleJump}
            aria-label={`Jump to log entry for anomaly #${anomaly.rank}`}
          >
            Jump to Log
          </button>
        </div>
      </div>

      <div className={styles.meterWrapper}>
        <div className={`${styles.meterFill} ${meterClass}`} style={{ width: `${fillPct}%` }} />
        <div className={styles.thresholdMarker} />
      </div>

      <div className={styles.scoreLabel}>score: {anomaly.score.toFixed(4)}</div>

      <div className={styles.message}>{message}</div>
    </div>
  )
}
