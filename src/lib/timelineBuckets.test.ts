import { describe, it, expect } from 'vitest'
import type { LogEntry } from '../types/log.types'
import type { AnomalyResult } from '../types/analysis.types'
import { computeBuckets } from './timelineBuckets'

function makeEntry(id: number, timestamp: number): LogEntry {
  return {
    id,
    timestamp,
    level: 'INFO',
    source: 'test',
    message: `entry ${id}`,
    raw: `entry ${id}`,
    byteOffset: id * 100,
  }
}

describe('computeBuckets', () => {
  it('empty entries array → returns []', () => {
    expect(computeBuckets([], 10)).toEqual([])
  })

  it('bucketCount <= 0 → returns []', () => {
    const entries = [makeEntry(0, 1000)]
    expect(computeBuckets(entries, 0)).toEqual([])
    expect(computeBuckets(entries, -1)).toEqual([])
  })

  it('10 entries evenly spaced, bucketCount=10 → each bucket has count=1', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(i, i * 1000))
    const buckets = computeBuckets(entries, 10)
    expect(buckets).toHaveLength(10)
    const totalCount = buckets.reduce((sum, b) => sum + b.count, 0)
    expect(totalCount).toBe(10)
  })

  it('all entries same timestamp → total count = entries.length', () => {
    const ts = 1704067200000
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry(i, ts))
    const buckets = computeBuckets(entries, 5)
    expect(buckets).toHaveLength(5)
    const totalCount = buckets.reduce((sum, b) => sum + b.count, 0)
    expect(totalCount).toBe(5)
  })

  it('anomaly attribution: anomalyCount reflects correctly', () => {
    // 4 entries spread across 4 buckets; entries 1 and 3 are anomalies
    const entries = [
      makeEntry(10, 0),
      makeEntry(11, 1000),
      makeEntry(12, 2000),
      makeEntry(13, 3000),
    ]
    const anomalies: AnomalyResult[] = [
      { logId: 11, score: 0.9, rank: 1 },
      { logId: 13, score: 0.8, rank: 2 },
    ]
    const buckets = computeBuckets(entries, 4, anomalies)
    const totalAnomalies = buckets.reduce((sum, b) => sum + b.anomalyCount, 0)
    expect(totalAnomalies).toBe(2)
  })

  it('no anomalies → all anomalyCount = 0', () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry(i, i * 1000))
    const buckets = computeBuckets(entries, 5)
    for (const b of buckets) {
      expect(b.anomalyCount).toBe(0)
    }
  })

  it('firstIndex: first bucket firstIndex = 0', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(i, i * 1000))
    const buckets = computeBuckets(entries, 5)
    expect(buckets[0]!.firstIndex).toBe(0)
  })

  it('firstIndex: second bucket has correct index', () => {
    // 10 entries over 10 seconds, 2 buckets → first 5 in bucket 0, next 5 in bucket 1
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(i, i * 1000))
    const buckets = computeBuckets(entries, 2)
    expect(buckets).toHaveLength(2)
    expect(buckets[0]!.firstIndex).toBe(0)
    expect(buckets[1]!.firstIndex).toBeGreaterThan(0)
  })

  it('bucket count matches requested bucketCount', () => {
    const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i, i * 100))
    const buckets = computeBuckets(entries, 10)
    expect(buckets).toHaveLength(10)
  })

  it('total count across all buckets equals entries.length', () => {
    const entries = Array.from({ length: 30 }, (_, i) => makeEntry(i, i * 500))
    const buckets = computeBuckets(entries, 7)
    const totalCount = buckets.reduce((sum, b) => sum + b.count, 0)
    expect(totalCount).toBe(30)
  })

  it('bucket startMs and endMs are ordered correctly', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(i, i * 1000))
    const buckets = computeBuckets(entries, 5)
    for (let i = 0; i < buckets.length - 1; i++) {
      expect(buckets[i]!.endMs).toBeLessThanOrEqual(buckets[i + 1]!.startMs + 1)
    }
  })

  it('single entry, single bucket → count=1, firstIndex=0', () => {
    const entries = [makeEntry(0, 5000)]
    const buckets = computeBuckets(entries, 1)
    expect(buckets).toHaveLength(1)
    expect(buckets[0]!.count).toBe(1)
    expect(buckets[0]!.firstIndex).toBe(0)
  })
})
