import { useEffect, useState, useCallback } from 'react'
import useStore from '../../store'
import { Spinner } from '../shared/Spinner'
import type { LogEntry } from '../../types/log.types'
import styles from './SmartContextPanel.module.css'

function buildGroups(
  lines: LogEntry[],
  anchorLogId: number,
  relatedLogIds: number[],
): { line: LogEntry; kind: 'anchor' | 'related' | 'normal' }[] {
  return lines.map((line) => {
    if (line.id === anchorLogId) return { line, kind: 'anchor' }
    if (relatedLogIds.includes(line.id)) return { line, kind: 'related' }
    return { line, kind: 'normal' }
  })
}

export function SmartContextPanel() {
  const selectedLogId = useStore((s) => s.ui.selectedLogId)
  const smartContexts = useStore((s) => s.analysis.smartContexts)
  const anomalies = useStore((s) => s.analysis.anomalies)
  const selectLog = useStore((s) => s.selectLog)

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  const isOpen = selectedLogId !== null
  const context = selectedLogId != null ? smartContexts[selectedLogId] : undefined
  const anomaly = anomalies.find((a) => a.logId === selectedLogId)

  useEffect(() => {
    setExpandedGroups(new Set())
    setCopied(false)
  }, [selectedLogId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      selectLog(null)
    },
    [selectLog],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const toggleGroup = (groupKey: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const handleCopy = async () => {
    if (!context) return
    const chainText = context.precedingLines
      .map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.level} ${l.source}: ${l.message}`)
      .join('\n')
    const text = `NARRATIVE:\n${context.narrative}\n\nCAUSAL CHAIN:\n${chainText}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatTimestamp = (ts: number) => new Date(ts).toISOString()

  const renderChain = () => {
    if (!context) return null
    const annotated = buildGroups(
      context.precedingLines,
      context.anchorLogId,
      context.relatedLogIds,
    )

    // Build segments: runs of 3+ normal lines get collapsed
    const segments: Array<
      | { type: 'line'; entry: (typeof annotated)[number]; idx: number }
      | { type: 'group'; lines: (typeof annotated)[number][]; startIdx: number }
    > = []

    let i = 0
    while (i < annotated.length) {
      const item = annotated[i]
      if (item.kind === 'normal') {
        let run = i
        while (run < annotated.length && annotated[run].kind === 'normal') run++
        const length = run - i
        if (length >= 3) {
          segments.push({ type: 'group', lines: annotated.slice(i, run), startIdx: i })
          i = run
          continue
        }
      }
      segments.push({ type: 'line', entry: item, idx: i })
      i++
    }

    return segments.map((seg, si) => {
      if (seg.type === 'group') {
        const isExpanded = expandedGroups.has(seg.startIdx)
        if (isExpanded) {
          return seg.lines.map((item, li) => (
            <div key={`${seg.startIdx}-${li}`} className={`${styles.chainLine} ${styles.normal}`}>
              <span className={styles.chainTimestamp}>{formatTimestamp(item.line.timestamp)}</span>
              <span className={styles.chainLevel}>{item.line.level}</span>
              <span className={styles.chainSource}>{item.line.source}</span>
              <span className={styles.chainMessage}>{item.line.message}</span>
            </div>
          ))
        }
        return (
          <button
            key={`group-${seg.startIdx}-${si}`}
            className={styles.collapsePill}
            onClick={() => toggleGroup(seg.startIdx)}
          >
            {seg.lines.length} similar lines — click to expand
          </button>
        )
      }

      const { entry, idx } = seg
      const cls =
        entry.kind === 'anchor'
          ? styles.anchor
          : entry.kind === 'related'
            ? styles.related
            : styles.normal

      return (
        <div key={`${entry.line.id}-${idx}`} className={`${styles.chainLine} ${cls}`}>
          <span className={styles.chainTimestamp}>{formatTimestamp(entry.line.timestamp)}</span>
          <span className={styles.chainLevel}>{entry.line.level}</span>
          <span className={styles.chainSource}>{entry.line.source}</span>
          <span className={styles.chainMessage}>{entry.line.message}</span>
        </div>
      )
    })
  }

  const anchorLog = context?.precedingLines.find((l) => l.id === context.anchorLogId)

  return (
    <aside
      role="complementary"
      aria-label="Log context panel"
      className={`${styles.panel} ${isOpen ? styles.open : ''}`}
    >
      <div className={styles.header}>
        <div className={styles.headerMeta}>
          {anomaly && (
            <span className={styles.anomalyBadge} title={`Anomaly rank #${anomaly.rank}`}>
              ANOMALY {(anomaly.score * 100).toFixed(0)}%
            </span>
          )}
          {anchorLog && (
            <>
              <span className={styles.timestamp}>{formatTimestamp(anchorLog.timestamp)}</span>
              <span className={styles.source}>{anchorLog.source}</span>
            </>
          )}
        </div>
        <button
          className={styles.closeBtn}
          aria-label="Close context panel"
          onClick={() => selectLog(null)}
        >
          ×
        </button>
      </div>

      <div className={styles.body}>
        {!context ? (
          <div className={styles.loading}>
            <Spinner />
            <span>Loading context…</span>
          </div>
        ) : (
          <>
            <section className={styles.narrative}>
              <div className={styles.sectionLabel}>NARRATIVE</div>
              <p className={styles.narrativeText}>{context.narrative}</p>
            </section>

            <section className={styles.causalChain}>
              <div className={styles.sectionLabel}>CAUSAL CHAIN</div>
              <div className={styles.chainList}>{renderChain()}</div>
            </section>

            <div className={styles.footer}>
              <button className={styles.copyBtn} onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy to clipboard'}
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
