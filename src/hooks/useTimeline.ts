import { useMemo, useRef, useEffect, useState } from 'react'
import useStore from '../store'
import { computeBuckets } from '../lib/timelineBuckets'
import type { TimelineBucket } from '../lib/timelineBuckets'

const DEFAULT_BUCKET_COUNT = 100

export function useTimeline() {
  const entries = useStore((s) => s.logs.entries)
  const anomalies = useStore((s) => s.analysis.anomalies)
  const containerRef = useRef<HTMLDivElement>(null)
  const [bucketCount, setBucketCount] = useState(DEFAULT_BUCKET_COUNT)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((obs) => {
      const w = obs[0]?.contentRect.width ?? 800
      // ~8px per bucket minimum
      setBucketCount(Math.max(20, Math.min(200, Math.floor(w / 8))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const buckets: TimelineBucket[] = useMemo(
    () => computeBuckets(entries, bucketCount, anomalies),
    [entries, bucketCount, anomalies],
  )

  return { buckets, containerRef, bucketCount }
}
