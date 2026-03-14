import { useState } from 'react'
import type { ClusterResult } from '../../types/analysis.types'
import type { LogEntry } from '../../types/log.types'
import useStore from '../../store'
import { useVirtualLog } from '../../hooks/useVirtualLog'
import styles from './ClusterGroup.module.css'

interface ClusterGroupProps {
  cluster: ClusterResult
  allEntries: LogEntry[]
  anomalyIds: Set<number>
  totalEntries: number
}

export function ClusterGroup({ cluster, allEntries, anomalyIds, totalEntries }: ClusterGroupProps) {
  const [open, setOpen] = useState(false)
  const filteredIds = useStore((s) => s.logs.filteredIds)
  const setFilter = useStore((s) => s.setFilter)
  const { scrollToIndex } = useVirtualLog()

  const anomalyCount = cluster.memberIds.filter((id) => anomalyIds.has(id)).length
  const pct = totalEntries > 0 ? ((cluster.size / totalEntries) * 100).toFixed(1) : '0.0'
  const isNoise = cluster.clusterId === -1
  const displayLabel = isNoise ? 'Uncategorized / Outliers' : cluster.label

  const memberEntries = cluster.memberIds
    .map((id) => allEntries.find((e) => e.id === id))
    .filter((e): e is LogEntry => e !== undefined)

  const previewEntries = memberEntries.slice(0, 5)

  const isActiveFilter =
    filteredIds !== null &&
    filteredIds.length === cluster.memberIds.length &&
    cluster.memberIds.every((id) => filteredIds.includes(id))

  function handleFilterToggle() {
    if (isActiveFilter) {
      setFilter(null)
    } else {
      setFilter(cluster.memberIds)
    }
  }

  function handleJumpToFirst() {
    const firstMember = memberEntries[0]
    if (!firstMember) return
    const idx = allEntries.findIndex((e) => e.id === firstMember.id)
    if (idx !== -1) scrollToIndex(idx)
  }

  return (
    <div className={styles.group}>
      <div className={styles.header} onClick={() => setOpen((o) => !o)}>
        <span className={`${styles.chevron}${open ? ` ${styles.open}` : ''}`}>▶</span>
        <span className={styles.label}>{displayLabel}</span>
        <span className={styles.meta}>
          {cluster.size} · {pct}%
        </span>
        {anomalyCount > 0 && <span className={styles.anomalyBadge}>{anomalyCount}</span>}
      </div>
      <div className={`${styles.body}${open ? ` ${styles.open}` : ''}`}>
        {previewEntries.map((entry) => (
          <div key={entry.id} className={styles.preview}>
            {entry.message}
          </div>
        ))}
        <div className={styles.actions}>
          <button
            className={styles.btn}
            onClick={handleJumpToFirst}
            disabled={memberEntries.length === 0}
          >
            Jump to first
          </button>
          <button
            className={`${styles.btn}${isActiveFilter ? ` ${styles.btnActive}` : ''}`}
            onClick={handleFilterToggle}
          >
            {isActiveFilter ? 'Clear filter' : 'Filter to cluster'}
          </button>
        </div>
      </div>
    </div>
  )
}
