import { useRef, useEffect, useState } from 'react'
import useStore from '../../store'
import styles from './ProgressBar.module.css'

const PHASE_LABELS: Record<string, string> = {
  loading: 'Loading',
  parsing: 'Parsing',
  analyzing: 'Analyzing',
  embedding: 'Embedding',
}

export function ProgressBar() {
  const ingestion = useStore((s) => s.ingestion)
  const analysisStatus = useStore((s) => s.analysis.analysisStatus)

  const prevLinesRef = useRef(0)
  const prevTimeRef = useRef(Date.now())
  const [linesPerSec, setLinesPerSec] = useState(0)

  useEffect(() => {
    const now = Date.now()
    const elapsed = (now - prevTimeRef.current) / 1000
    if (elapsed > 0.2) {
      const delta = ingestion.parsedLines - prevLinesRef.current
      setLinesPerSec(Math.round(delta / elapsed))
      prevLinesRef.current = ingestion.parsedLines
      prevTimeRef.current = now
    }
  }, [ingestion.parsedLines])

  const activeStatuses = ['loading', 'parsing', 'analyzing', 'embedding']
  const isActive =
    activeStatuses.includes(ingestion.status) || activeStatuses.includes(analysisStatus)

  if (!isActive) return null

  const progress = ingestion.progress
  const percent = Math.round(progress * 100)
  const phase = PHASE_LABELS[ingestion.status] ?? PHASE_LABELS[analysisStatus] ?? 'Working'
  const modelNotReady = analysisStatus === 'idle' && ingestion.status === 'loading'

  return (
    <div className={styles.container}>
      <div className={styles.phase}>{phase}</div>
      <div className={styles.barWrapper}>
        <div
          className={styles.barFill}
          style={{ width: `${Math.max(2, percent)}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className={styles.label}>
        <span>{percent}%</span>
        {linesPerSec > 0 && <span>{linesPerSec.toLocaleString()} lines/sec</span>}
        <span>{ingestion.parsedLines.toLocaleString()} lines</span>
      </div>
      {modelNotReady && (
        <div className={styles.hint}>
          Inference model (~40 MB) will be downloaded on first run and cached locally.
        </div>
      )}
    </div>
  )
}
