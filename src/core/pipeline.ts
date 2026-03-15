/**
 * analyze() — the public programmatic API for LogiLog.
 *
 * Orchestrates: parse → embed → scoreAnomalies → cluster → extractContext → optional AI forensics
 */

import * as fs from 'fs'
import { Readable } from 'stream'
import type { AnalyzeOptions, AnalysisReport, Anomaly, Cluster } from './types/results'
import type { LogEntry } from './types/log'
import { parseFile } from './parsers/node-stream'
import { NodeEmbedder } from './inference/node-embedder'
import { scoreAnomalies, cluster } from './analysis/index'
import { extractContext } from './context/index'
import { runAiForensics } from './forensics/client'
import type { ClusterResult } from './types/analysis'

const DEFAULT_THRESHOLD = 0.35
const DEFAULT_CONTEXT_WINDOW = 75
const MODEL_ID = 'Xenova/bge-small-en-v1.5'

/**
 * Analyze a log file and return a typed AnalysisReport.
 *
 * @param options - AnalyzeOptions
 * @returns Promise<AnalysisReport>
 */
export async function analyze(options: AnalyzeOptions): Promise<AnalysisReport> {
  const startTime = Date.now()
  const {
    input,
    threshold: _threshold = DEFAULT_THRESHOLD,
    contextWindow: _contextWindow = DEFAULT_CONTEXT_WINDOW,
    top,
    cacheDir,
    anthropicApiKey,
    onProgress,
  } = options

  onProgress?.('parsing', 0)

  // ---- Step 1: Parse ----
  const allLogs: LogEntry[] = []
  let parserUsed = 'generic'

  if (typeof input === 'string') {
    // Determine if it's a file path or raw content
    const isFilePath = !input.includes('\n') && input.length < 4096
    if (isFilePath) {
      // Check if file actually exists
      if (fs.existsSync(input)) {
        const result = await parseFile(
          input,
          (batch) => allLogs.push(...batch),
          (progress) => {
            if (progress.total) {
              onProgress?.('parsing', Math.round((progress.parsed / progress.total) * 20))
            }
          },
        )
        parserUsed = result.parserUsed
      } else {
        // Treat as raw log content
        parserUsed = await parseRawContent(input, allLogs)
      }
    } else {
      // Multi-line string — treat as raw log content
      parserUsed = await parseRawContent(input, allLogs)
    }
  } else {
    // AsyncIterable<string>
    parserUsed = await parseAsyncIterable(input, allLogs)
  }

  onProgress?.('parsing', 20)

  if (allLogs.length === 0) {
    return buildEmptyReport(parserUsed, startTime)
  }

  // ---- Step 2: Embed ----
  onProgress?.('embedding', 20)

  const embedder = new NodeEmbedder(cacheDir)
  await embedder.initialize((percent) => {
    onProgress?.('embedding', 20 + Math.round(percent * 0.3))
  })

  const messages = allLogs.map((l) => l.message)
  const vectors = await embedder.embed(messages, (done, total) => {
    onProgress?.('embedding', 50 + Math.round((done / total) * 10))
  })

  embedder.dispose()

  const logIds = allLogs.map((l) => l.id)

  onProgress?.('analyzing', 60)

  // ---- Step 3: Score anomalies ----
  const anomalyResults = scoreAnomalies(vectors, logIds)

  // ---- Step 4: Cluster ----
  const clusterResults: ClusterResult[] = cluster(vectors, logIds, messages)

  onProgress?.('analyzing', 80)

  // ---- Step 5: Build embeddings map for context extraction ----
  const embeddingMap = new Map<number, Float32Array>()
  for (let i = 0; i < logIds.length; i++) {
    embeddingMap.set(logIds[i]!, vectors[i]!)
  }

  // ---- Step 6: Extract context for top anomalies ----
  const topAnomalies = top ? anomalyResults.slice(0, top) : anomalyResults

  const anomalies: Anomaly[] = []

  for (const ar of topAnomalies) {
    const logEntry = allLogs.find((l) => l.id === ar.logId)
    if (!logEntry) continue

    const ctx = extractContext(ar.logId, allLogs, embeddingMap, ar.score)

    const relatedLines = ctx.relatedLogIds
      .map((id) => allLogs.find((l) => l.id === id))
      .filter((l): l is LogEntry => l !== undefined)

    const anomaly: Anomaly = {
      rank: ar.rank,
      score: ar.score,
      line: logEntry.id + 1, // 1-indexed
      level: logEntry.level,
      source: logEntry.source,
      message: logEntry.message,
      timestamp: logEntry.timestamp,
      context: {
        precedingLines: ctx.precedingLines,
        narrative: ctx.narrative,
        relatedLines,
      },
    }

    // ---- Step 7 (optional): AI forensics ----
    if (anthropicApiKey) {
      try {
        const ai = await runAiForensics(
          {
            log: logEntry,
            context: ctx,
            score: ar.score,
            rank: ar.rank,
            totalAnomalies: anomalyResults.length,
          },
          anthropicApiKey,
        )
        anomaly.aiForensics = ai
      } catch {
        // AI forensics failure is non-fatal
      }
    }

    anomalies.push(anomaly)
  }

  onProgress?.('analyzing', 90)

  // ---- Step 8: Build clusters ----
  const clusters: Cluster[] = clusterResults.map((cr) => ({
    id: cr.clusterId,
    label: cr.label,
    size: cr.size,
    memberLines: cr.memberIds.map((id) => id + 1), // 1-indexed
  }))

  // ---- Build summary ----
  const severityBreakdown = {
    TRACE: 0,
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    FATAL: 0,
    UNKNOWN: 0,
  }
  for (const a of anomalies) {
    severityBreakdown[a.level]++
  }

  const durationMs = Date.now() - startTime

  onProgress?.('done', 100)

  return {
    anomalies,
    clusters,
    meta: {
      inputLines: allLogs.length,
      parserUsed,
      modelId: MODEL_ID,
      durationMs,
      analyzedAt: new Date().toISOString(),
    },
    summary: {
      totalAnomalies: anomalies.length,
      totalClusters: clusters.length,
      topAnomaly: anomalies[0] ?? null,
      severityBreakdown,
    },
  }
}

// ---- Helpers ----

function buildEmptyReport(parserUsed: string, startTime: number): AnalysisReport {
  return {
    anomalies: [],
    clusters: [],
    meta: {
      inputLines: 0,
      parserUsed,
      modelId: MODEL_ID,
      durationMs: Date.now() - startTime,
      analyzedAt: new Date().toISOString(),
    },
    summary: {
      totalAnomalies: 0,
      totalClusters: 0,
      topAnomaly: null,
      severityBreakdown: { TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0, UNKNOWN: 0 },
    },
  }
}

async function parseRawContent(content: string, out: LogEntry[]): Promise<string> {
  const readable = Readable.from(content)
  const result = await parseFile(readable, (batch) => out.push(...batch))
  return result.parserUsed
}

async function parseAsyncIterable(
  iterable: AsyncIterable<string>,
  out: LogEntry[],
): Promise<string> {
  // Buffer lines from the async iterable into a string, then parse
  const lines: string[] = []
  for await (const line of iterable) {
    lines.push(line)
  }
  return parseRawContent(lines.join('\n'), out)
}
