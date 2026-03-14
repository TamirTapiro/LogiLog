import { useMemo } from 'react'
import useStore from '../../store'
import type { ClusterResult } from '../../types/analysis.types'
import styles from './ForensicsView.module.css'

function clusterSeverity(cluster: ClusterResult, anomalyIds: Set<number>): 'anomalous' | 'common' {
  if (cluster.size <= 2) return 'anomalous'
  const anomalyCount = cluster.memberIds.filter((id) => anomalyIds.has(id)).length
  return anomalyCount / cluster.size > 0.3 ? 'anomalous' : 'common'
}

function suggestedFix(message: string, source: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('redis') || msg.includes('connection pool')) {
    return 'Check Redis connectivity and connection pool limits. Consider increasing pool size or investigating network latency between services.'
  }
  if (msg.includes('upstream') || msg.includes('dependency')) {
    return 'Inspect upstream dependency health. Enable circuit breaker patterns and verify SLAs for dependent services.'
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Investigate upstream service response times. Check for resource contention or network issues between services.'
  }
  if (msg.includes('auth') || msg.includes('unauthorized')) {
    return 'Review authentication service health and token validity. Check for expired credentials or misconfigured policies.'
  }
  if (msg.includes('probe') || msg.includes('readiness') || msg.includes('liveness')) {
    return 'Check pod readiness and liveness probes. Review resource limits and startup times in the affected deployment.'
  }
  if (msg.includes('memory') || msg.includes('heap') || msg.includes('oom')) {
    return 'Investigate memory usage. Consider increasing memory limits or profiling for memory leaks.'
  }
  if (msg.includes('database') || msg.includes('query') || msg.includes('sql')) {
    return 'Review database query performance and connection pool configuration. Check for slow queries or lock contention.'
  }
  return `Investigate ${source || 'the affected service'} for abnormal behavior. Review recent deployments and configuration changes near this timestamp.`
}

function cosineLabel(score: number): string {
  if (score > 0.7) return 'Very High Uniqueness'
  if (score > 0.5) return 'High Uniqueness'
  if (score > 0.35) return 'Moderate Uniqueness'
  return 'Low Uniqueness'
}

function formatTs(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 23)
}

export function ForensicsView() {
  const anomalies = useStore((s) => s.analysis.anomalies)
  const clusters = useStore((s) => s.analysis.clusters)
  const smartContexts = useStore((s) => s.analysis.smartContexts)
  const analysisStatus = useStore((s) => s.analysis.analysisStatus)
  const entries = useStore((s) => s.logs.entries)

  const topAnomaly = anomalies[0]
  const topContext = topAnomaly ? smartContexts[topAnomaly.logId] : undefined
  const topLog = topAnomaly ? entries.find((e) => e.id === topAnomaly.logId) : undefined

  const anomalyIds = useMemo(() => new Set(anomalies.map((a) => a.logId)), [anomalies])

  if (analysisStatus === 'idle' || analysisStatus === 'embedding' || analysisStatus === 'analyzing') {
    return (
      <div className={styles.empty}>
        {analysisStatus === 'idle'
          ? 'Load a log file to begin forensic analysis.'
          : 'Running analysis…'}
      </div>
    )
  }

  if (anomalies.length === 0) {
    return <div className={styles.empty}>No anomalies detected in this log file.</div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.scroll}>
        {/* ── Clusters ────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>CLUSTERS</div>
          <div className={styles.sectionSubtitle}>
            Identified {clusters.length} Unique Pattern{clusters.length !== 1 ? 's' : ''}
          </div>
          <div className={styles.clusterList}>
            {clusters.map((cluster) => {
              const sev = clusterSeverity(cluster, anomalyIds)
              return (
                <div
                  key={cluster.clusterId}
                  className={`${styles.clusterRow} ${sev === 'anomalous' ? styles.anomalousRow : ''}`}
                >
                  <span className={`${styles.marker} ${sev === 'anomalous' ? styles.markerAlert : styles.markerNormal}`}>
                    {sev === 'anomalous' ? '[!]' : '[+]'}
                  </span>
                  <span className={styles.clusterLabel}>{cluster.label}</span>
                  <span className={styles.clusterCount}>
                    ({cluster.size.toLocaleString()} event{cluster.size !== 1 ? 's' : ''})
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Context window ───────────────────────────── */}
        {(topContext || topLog) && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>CONTEXT WINDOW</div>
            <div className={styles.logBlock}>
              {topContext?.precedingLines.slice(-8).map((log) => (
                <div key={log.id} className={`${styles.logLine} ${styles[`level${log.level}`] ?? ''}`}>
                  <span className={styles.logTs}>{formatTs(log.timestamp)}</span>
                  <span className={`${styles.logLevel} ${styles[`level${log.level}`] ?? ''}`}>{log.level}</span>
                  <span className={styles.logMsg}>{log.message}</span>
                </div>
              ))}
              {topLog && (
                <div className={styles.anchorLine}>
                  <span className={styles.logTs}>{formatTs(topLog.timestamp)}</span>
                  <span className={`${styles.logLevel} ${styles[`level${topLog.level}`] ?? ''}`}>{topLog.level}</span>
                  <span className={styles.logMsg}>{topLog.message}</span>
                  <span className={styles.anchorTag}>▶ TOP ANOMALY</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── AI Forensics ─────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>AI FORENSICS</div>

          <div className={styles.forensicsBlock}>
            <div className={styles.blockTitle}>ROOT CAUSE ANALYSIS</div>
            <p className={styles.narrative}>
              {topContext?.narrative ??
                `Anomaly detected in ${topLog?.source ?? 'unknown source'} (score: ${topAnomaly?.score.toFixed(3)}). No context extracted yet.`}
            </p>
          </div>

          {topLog && (
            <div className={styles.forensicsBlock}>
              <div className={styles.blockTitle}>Suggested Fix</div>
              <p className={styles.fix}>{suggestedFix(topLog.message, topLog.source)}</p>
            </div>
          )}

          {topAnomaly && (
            <div className={styles.forensicsBlock}>
              <div className={styles.blockTitle}>Neural Context Window</div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Cosine Distance</span>
                <span className={styles.metricValue}>
                  {topAnomaly.score.toFixed(4)}
                  <span className={styles.metricTag}>&nbsp;({cosineLabel(topAnomaly.score)})</span>
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Anomaly Rank</span>
                <span className={styles.metricValue}>
                  #{topAnomaly.rank} of {anomalies.length} anomalies detected
                </span>
              </div>
              {topContext && (
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Related Logs</span>
                  <span className={styles.metricValue}>{topContext.relatedLogIds.length} entries</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
