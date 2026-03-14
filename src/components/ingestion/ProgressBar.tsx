import { useRef, useEffect, useState } from 'react'
import useStore from '../../store'
import styles from './ProgressBar.module.css'

export function ProgressBar() {
  const ingestion = useStore((s) => s.ingestion)
  const analysisStatus = useStore((s) => s.analysis.analysisStatus)

  const prevLinesRef = useRef(0)
  const prevTimeRef = useRef(Date.now())
  const [linesPerSec, setLinesPerSec] = useState(0)

  const analyzingStartRef = useRef<number | null>(null)

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

  useEffect(() => {
    if (analysisStatus === 'analyzing') {
      if (analyzingStartRef.current === null) {
        analyzingStartRef.current = Date.now()
      }
    } else {
      analyzingStartRef.current = null
    }
  }, [analysisStatus])

  if (ingestion.status === 'idle') return null
  if (ingestion.status === 'done' && analysisStatus === 'done') return null

  if (ingestion.status === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.phase} style={{ color: 'var(--color-accent-red)' }}>
          Error
        </div>
        <div className={styles.hint} style={{ color: 'var(--color-text-secondary)' }}>
          {ingestion.error ?? 'An unexpected error occurred.'}
        </div>
        <div className={styles.hint}>Drop another file to retry</div>
      </div>
    )
  }

  const progress = ingestion.progress
  const percent = Math.round(progress * 100)

  let phaseLabel = 'Working'
  let extraLabel: string | null = null

  if (ingestion.status === 'loading') {
    phaseLabel = 'Opening'
  } else if (ingestion.status === 'parsing') {
    phaseLabel = 'Parsing'
    if (linesPerSec > 0) {
      extraLabel = `${linesPerSec.toLocaleString()} lines/sec`
    }
  } else if (analysisStatus === 'embedding') {
    phaseLabel = 'Loading Model'
  } else if (analysisStatus === 'analyzing') {
    phaseLabel = 'Analyzing'
    if (analyzingStartRef.current !== null && progress > 0 && progress < 1) {
      const elapsed = (Date.now() - analyzingStartRef.current) / 1000
      const remaining = Math.round((elapsed / progress) * (1 - progress))
      extraLabel = `${percent}% — ${remaining}s remaining`
    } else {
      extraLabel = `${percent}%`
    }
  }

  const modelNotReady = analysisStatus === 'idle' && ingestion.status === 'loading'

  return (
    <div className={styles.container}>
      <div className={styles.phase}>{phaseLabel}</div>
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
        {extraLabel && <span>{extraLabel}</span>}
        {ingestion.status === 'parsing' && (
          <span>{ingestion.parsedLines.toLocaleString()} lines</span>
        )}
      </div>
      {modelNotReady && (
        <div className={styles.hint}>
          Inference model (~40 MB) will be downloaded on first run and cached locally.
        </div>
      )}
    </div>
  )
}
