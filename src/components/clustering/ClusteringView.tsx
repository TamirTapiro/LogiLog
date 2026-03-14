import useStore from '../../store'
import type { ClusterResult } from '../../types/analysis.types'
import { ClusterGroup } from './ClusterGroup'
import { exportToJson, exportToCsv } from '../../lib/exportUtils'
import styles from './ClusteringView.module.css'

function SkeletonRow() {
  return <div className={styles.skeletonRow} />
}

function sortClusters(clusters: ClusterResult[]): ClusterResult[] {
  return [...clusters].sort((a, b) => {
    if (a.clusterId === -1) return 1
    if (b.clusterId === -1) return -1
    return b.size - a.size
  })
}

export function ClusteringView() {
  const clusters = useStore((s) => s.analysis.clusters)
  const analysisStatus = useStore((s) => s.analysis.analysisStatus)
  const allEntries = useStore((s) => s.logs.entries)
  const anomalies = useStore((s) => s.analysis.anomalies)

  const anomalyIds = new Set(anomalies.map((a) => a.logId))
  const isLoading = analysisStatus === 'analyzing' || analysisStatus === 'embedding'
  const isDone = analysisStatus === 'done'
  const sorted = sortClusters(clusters)

  const handleExportJson = async () => {
    const data = sorted.map((c) => ({
      clusterId: c.clusterId,
      label: c.label,
      size: c.size,
      memberIds: c.memberIds,
    }))
    await exportToJson(data, 'clusters.json')
  }

  const handleExportCsv = async () => {
    const headers = ['clusterId', 'label', 'size', 'memberCount']
    const rows = sorted.map((c) => ({
      clusterId: c.clusterId,
      label: c.label,
      size: c.size,
      memberCount: c.memberIds.length,
    }))
    await exportToCsv(rows, headers, 'clusters.csv')
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    )
  }

  if (isDone && clusters.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>No clusters found.</div>
      </div>
    )
  }

  if (clusters.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>Run analysis to see clusters.</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.exportBar}>
        <button
          className={styles.exportBtn}
          onClick={handleExportJson}
          aria-label="Export clusters as JSON"
        >
          JSON
        </button>
        <button
          className={styles.exportBtn}
          onClick={handleExportCsv}
          aria-label="Export clusters as CSV"
        >
          CSV
        </button>
      </div>
      <div className={styles.list}>
        {sorted.map((cluster) => (
          <ClusterGroup
            key={cluster.clusterId}
            cluster={cluster}
            allEntries={allEntries}
            anomalyIds={anomalyIds}
            totalEntries={allEntries.length}
          />
        ))}
      </div>
    </div>
  )
}
