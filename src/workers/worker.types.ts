// Worker message type schemas — no imports from src/
// These types must be self-contained so workers can import them without
// pulling in the full application dependency tree.

// ---- Shared primitives ----

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN'

export interface WorkerLogEntry {
  id: number
  timestamp: number
  level: LogLevel
  source: string
  message: string
  raw: string
  byteOffset: number
}

// ---- Parse worker ----

export interface ParseWorkerInput {
  type: 'parse'
  buffer: ArrayBuffer
  fileName: string
}

export interface ParseWorkerOutput {
  type: 'batch' | 'done' | 'error'
  entries?: WorkerLogEntry[]
  totalParsed?: number
  done?: boolean
  error?: string
}

// ---- Inference worker ----

export interface InferenceWorkerInput {
  type: 'embed'
  messages: string[]
  ids: number[]
}

export interface InferenceWorkerOutput {
  type: 'embeddings' | 'ready' | 'error'
  ids?: number[]
  vectors?: Float32Array[]
  error?: string
}

// ---- Analysis worker ----

export interface AnalysisWorkerInput {
  type: 'analyze'
  ids: number[]
  vectors: Float32Array[]
}

export interface AnalysisWorkerOutput {
  type: 'anomalies' | 'clusters' | 'error'
  anomalies?: Array<{ logId: number; score: number; rank: number }>
  clusters?: Array<{
    clusterId: number
    label: string
    memberIds: number[]
    centroid: Float32Array
    size: number
  }>
  error?: string
}

// ---- Context worker ----

export interface ContextWorkerInput {
  type: 'extract'
  anchorLogId: number
  precedingEntries: WorkerLogEntry[]
  relatedIds: number[]
}

export interface ContextWorkerOutput {
  type: 'context' | 'error'
  anchorLogId?: number
  narrative?: string
  relatedLogIds?: number[]
  error?: string
}
