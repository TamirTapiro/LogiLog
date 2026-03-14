import { useState, useCallback, type DragEvent, type KeyboardEvent } from 'react'
import useStore from '../../store'
import { useFileIngestion } from '../../hooks/useFileIngestion'
import styles from './FileDropZone.module.css'

export function FileDropZone() {
  const ingestionStatus = useStore((s) => s.ingestion.status)
  const { ingestFile, openFilePicker } = useFileIngestion()
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const file = e.dataTransfer.files[0]
      if (file) {
        void ingestFile(file)
      }
    },
    [ingestFile],
  )

  const handleClick = useCallback(() => {
    void openFilePicker()
  }, [openFilePicker])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        void openFilePicker()
      }
    },
    [openFilePicker],
  )

  if (ingestionStatus !== 'idle') return null

  return (
    <div
      className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Drop log file or click to browse"
    >
      <div className={styles.icon}>⌃</div>
      <div className={styles.primaryText}>Drop log file here</div>
      <div className={styles.secondaryText}>or click to browse</div>
      <div className={styles.extensions}>.log .txt .gz .zip</div>
    </div>
  )
}
