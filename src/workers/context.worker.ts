import * as Comlink from 'comlink'
import type { SmartContext } from '../types/analysis.types'
import type { LogEntry } from '../types/log.types'
import { cosineSimilarity, cosineDistance } from '../lib/cosineSimilarity'

const CONTEXT_WINDOW_SIZE = 75
const DEDUP_THRESHOLD = 0.05 // cosine distance below this → duplicate
const DEDUP_CONSECUTIVE = 10 // collapse runs of ≥10 near-duplicates
const RELATED_THRESHOLD = 0.6 // similarity to anchor to be considered related

function extractContext(
  anchorLogId: number,
  allLogs: LogEntry[],
  embeddings: Map<number, Float32Array>,
  anomalyScore: number,
): SmartContext {
  // 1. Find anchor index in allLogs
  const anchorIdx = allLogs.findIndex((l) => l.id === anchorLogId)
  if (anchorIdx === -1) {
    return {
      anchorLogId,
      precedingLines: [],
      narrative: `No context found for log ${anchorLogId}.`,
      relatedLogIds: [],
    }
  }

  const anchor = allLogs[anchorIdx]!

  // 2. Take CONTEXT_WINDOW_SIZE lines preceding the anchor
  const start = Math.max(0, anchorIdx - CONTEXT_WINDOW_SIZE)
  const precedingRaw = allLogs.slice(start, anchorIdx)

  // 3. Deduplicate: collapse consecutive lines with cosine distance <0.05
  const precedingLines = deduplicateLines(precedingRaw, embeddings)

  // 4. Identify related lines: cosine similarity to anchor embedding > 0.6
  const anchorEmbedding = embeddings.get(anchorLogId)
  const relatedLogIds: number[] = []
  if (anchorEmbedding) {
    for (const log of allLogs) {
      if (log.id === anchorLogId) continue
      const emb = embeddings.get(log.id)
      if (emb && cosineSimilarity(anchorEmbedding, emb) > RELATED_THRESHOLD) {
        relatedLogIds.push(log.id)
      }
    }
  }

  // 5. Generate narrative
  const narrative = buildNarrative(anchor, precedingLines, anomalyScore)

  return {
    anchorLogId,
    precedingLines,
    narrative,
    relatedLogIds,
  }
}

function deduplicateLines(lines: LogEntry[], embeddings: Map<number, Float32Array>): LogEntry[] {
  if (lines.length === 0) return []
  const result: LogEntry[] = []
  let runStart = 0

  for (let i = 1; i <= lines.length; i++) {
    const prev = lines[i - 1]!
    const curr = lines[i]
    const prevEmb = embeddings.get(prev.id)
    const currEmb = curr ? embeddings.get(curr.id) : undefined

    const isNearDup =
      currEmb && prevEmb ? cosineDistance(prevEmb, currEmb) < DEDUP_THRESHOLD : false

    if (!isNearDup || i === lines.length) {
      const runLen = i - runStart
      const representative = lines[runStart]!
      if (runLen >= DEDUP_CONSECUTIVE) {
        // Collapsed representative with annotation in message
        result.push({
          ...representative,
          message: `${representative.message} [+${runLen - 1} similar lines collapsed]`,
        })
      } else {
        // Add all lines in the run individually
        for (let j = runStart; j < i; j++) result.push(lines[j]!)
      }
      runStart = i
    }
  }

  return result
}

function buildNarrative(anchor: LogEntry, preceding: LogEntry[], anomalyScore: number): string {
  const ts = new Date(anchor.timestamp).toISOString()
  const source = anchor.source || 'unknown source'
  const n = preceding.length

  // Find first error or warn in preceding lines
  const firstNotable = preceding.find(
    (l) => l.level === 'ERROR' || l.level === 'FATAL' || l.level === 'WARN',
  )

  // Top 3 distinct event summaries (first word of messages, deduplicated)
  const summaries: string[] = []
  const seen = new Set<string>()
  for (const l of preceding.slice().reverse()) {
    const word = l.message.split(/\s+/).slice(0, 4).join(' ')
    if (!seen.has(word)) {
      seen.add(word)
      summaries.push(`"${word}"`)
      if (summaries.length >= 3) break
    }
  }

  let narrative =
    `At ${ts}, ${source} encountered an anomaly (score: ${anomalyScore.toFixed(2)}) ` +
    `after ${n} preceding events. `

  if (firstNotable) {
    narrative += `First notable event: "${firstNotable.message.slice(0, 120)}". `
  }

  if (summaries.length > 0) {
    narrative += `Likely preceded by: ${summaries.join(', ')}.`
  }

  return narrative
}

// Alias consumed by useContextWorker hook
export type ContextWorker = ContextWorkerAPI

export interface ContextWorkerAPI {
  extractContext(
    anchorLogId: number,
    allLogs: LogEntry[],
    embeddings: Map<number, Float32Array>,
    anomalyScore: number,
  ): SmartContext
}

const contextWorker: ContextWorkerAPI = {
  extractContext,
}

Comlink.expose(contextWorker)
