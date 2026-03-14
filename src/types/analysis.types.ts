import type { LogEntry } from './log.types'

export type EmbeddingVector = Float32Array

export interface AnomalyResult {
  logId: number
  score: number
  rank: number
}

export interface ClusterResult {
  clusterId: number
  label: string
  memberIds: number[]
  centroid: EmbeddingVector
  size: number
}

export interface SmartContext {
  anchorLogId: number
  precedingLines: LogEntry[]
  narrative: string
  relatedLogIds: number[]
}
