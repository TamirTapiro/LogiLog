import type { StoreState } from './index'
import type { LogEntry } from '../types/log.types'
import type { AnomalyResult } from '../types/analysis.types'

// Returns log entries that appear in the anomaly results, sorted by score descending
export const selectAnomalousLogs = (state: StoreState): LogEntry[] => {
  const anomalyIds = new Set(state.analysis.anomalies.map((a: AnomalyResult) => a.logId))
  return state.logs.entries
    .filter((entry: LogEntry) => anomalyIds.has(entry.id))
    .sort((a: LogEntry, b: LogEntry) => {
      const scoreA =
        state.analysis.anomalies.find((an: AnomalyResult) => an.logId === a.id)?.score ?? 0
      const scoreB =
        state.analysis.anomalies.find((an: AnomalyResult) => an.logId === b.id)?.score ?? 0
      return scoreB - scoreA
    })
}

// Placeholder: buckets logs into time slots for the timeline component
// Returns array of { timestamp: number; count: number; anomalyCount: number }
export interface TimelineBucket {
  timestamp: number
  count: number
  anomalyCount: number
}

export const selectTimelineBuckets = (state: StoreState, bucketCount = 100): TimelineBucket[] => {
  const entries = state.logs.entries
  if (entries.length === 0) return []

  const anomalyIds = new Set(state.analysis.anomalies.map((a: AnomalyResult) => a.logId))
  const timestamps = entries.map((e: LogEntry) => e.timestamp)
  const minTs = Math.min(...timestamps)
  const maxTs = Math.max(...timestamps)
  const range = maxTs - minTs || 1
  const bucketSize = range / bucketCount

  const buckets: TimelineBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    timestamp: minTs + i * bucketSize,
    count: 0,
    anomalyCount: 0,
  }))

  for (const entry of entries) {
    const idx = Math.min(Math.floor((entry.timestamp - minTs) / bucketSize), bucketCount - 1)
    const bucket = buckets[idx]
    if (bucket) {
      bucket.count++
      if (anomalyIds.has(entry.id)) bucket.anomalyCount++
    }
  }

  return buckets
}
