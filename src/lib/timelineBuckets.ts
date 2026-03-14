import type { LogEntry } from '../types/log.types'
import type { AnomalyResult } from '../types/analysis.types'

export interface TimelineBucket {
  startMs: number
  endMs: number
  count: number
  anomalyCount: number
  firstIndex: number
}

export function computeBuckets(
  entries: LogEntry[],
  bucketCount: number,
  anomalies: AnomalyResult[] = [],
): TimelineBucket[] {
  if (entries.length === 0 || bucketCount <= 0) return []

  const anomalySet = new Set(anomalies.map((a) => a.logId))

  const minMs = entries[0]!.timestamp
  const maxMs = entries[entries.length - 1]!.timestamp
  const span = maxMs - minMs || 1
  const bucketWidth = span / bucketCount

  const buckets: TimelineBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    startMs: minMs + i * bucketWidth,
    endMs: minMs + (i + 1) * bucketWidth,
    count: 0,
    anomalyCount: 0,
    firstIndex: -1,
  }))

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const bucketIndex = Math.min(
      Math.floor(((entry.timestamp - minMs) / span) * bucketCount),
      bucketCount - 1,
    )
    const bucket = buckets[bucketIndex]!
    if (bucket.firstIndex === -1) bucket.firstIndex = i
    bucket.count++
    if (anomalySet.has(entry.id)) bucket.anomalyCount++
  }

  return buckets
}
