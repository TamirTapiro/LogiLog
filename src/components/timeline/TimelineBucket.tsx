import type { TimelineBucket } from '../../lib/timelineBuckets'
import styles from './TimelineBucket.module.css'

interface BucketTooltipProps {
  active?: boolean
  payload?: Array<{ payload: TimelineBucket }>
}

export function BucketTooltip({ active, payload }: BucketTooltipProps) {
  if (!active || !payload?.length) return null
  const bucket = payload[0]!.payload

  const start = new Date(bucket.startMs).toISOString().replace('T', ' ').replace('Z', '')
  const end = new Date(bucket.endMs).toISOString().replace('T', ' ').replace('Z', '')

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>
        {start} — {end}
      </div>
      <div>Total lines: {bucket.count}</div>
      {bucket.anomalyCount > 0 && (
        <div className={styles.tooltipAnomaly}>Anomalies: {bucket.anomalyCount}</div>
      )}
    </div>
  )
}
