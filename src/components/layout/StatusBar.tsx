import useStore from '../../store'
import styles from './StatusBar.module.css'

export function StatusBar() {
  const ingestion = useStore((s) => s.ingestion)
  const anomalies = useStore((s) => s.analysis.anomalies)
  const clusters = useStore((s) => s.analysis.clusters)

  const fileName = ingestion.fileName ?? 'no file loaded'
  const lines = ingestion.parsedLines
  const status = ingestion.status

  return (
    <div className={styles.statusBar} role="status">
      <div className={styles.left}>
        <span className={styles.filename}>{fileName}</span>
        {' · '}
        {lines.toLocaleString()} lines
        {' · '}
        <span>{status}</span>
      </div>
      <div className={styles.center}>LogiLog</div>
      <div className={styles.right}>
        <span className={styles.accent}>{anomalies.length}</span> anomalies
        {' · '}
        <span className={styles.accent}>{clusters.length}</span> clusters
      </div>
    </div>
  )
}
