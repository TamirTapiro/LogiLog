import type { ListChildComponentProps } from 'react-window'
import { Badge } from '../shared/Badge'
import useStore from '../../store'
import type { LogEntry } from '../../types/log.types'
import type { LogLevel } from '../../types/log.types'
import styles from './LogRow.module.css'

interface LogRowData {
  entries: LogEntry[]
  anomalyMap: Map<number, number>
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  TRACE: 'var(--color-text-muted, #888)',
  DEBUG: 'var(--color-accent-blue, #60a5fa)',
  INFO: 'var(--color-accent-green, #4ade80)',
  WARN: '#fbbf24',
  ERROR: 'var(--color-accent-red, #f87171)',
  FATAL: '#e11d48',
  UNKNOWN: 'var(--color-text-muted, #888)',
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const sss = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${sss}`
}

export function LogRow({ index, style, data }: ListChildComponentProps<LogRowData>) {
  const { entries, anomalyMap } = data
  const entry = entries[index]
  if (!entry) return null

  const score = anomalyMap.get(entry.id)
  const isAnomaly = score !== undefined

  const borderColor = isAnomaly ? `rgba(248, 113, 113, ${0.3 + score! * 0.7})` : 'transparent'

  function handleClick() {
    useStore.getState().selectLog(entry!.id)
  }

  return (
    <div
      style={{ ...style, borderLeftColor: borderColor }}
      className={styles.row}
      onClick={handleClick}
      role="row"
      aria-rowindex={index + 1}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleClick()
      }}
    >
      <span className={styles.lineNum}>{index + 1}</span>
      <span className={styles.timestamp}>{formatTimestamp(entry.timestamp)}</span>
      <span className={styles.level}>
        <Badge color={LEVEL_COLORS[entry.level]}>{entry.level}</Badge>
      </span>
      <span className={styles.source}>{entry.source}</span>
      <span className={styles.message}>{entry.message}</span>
    </div>
  )
}
