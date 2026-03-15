import * as Comlink from 'comlink'
import type { AnomalyResult, ClusterResult } from '../types/analysis.types'
import { scoreAnomalies, cluster } from '../core/analysis'

// Alias consumed by useAnalysisWorker hook
export type AnalysisWorker = AnalysisWorkerAPI

export interface AnalysisWorkerAPI {
  scoreAnomalies(embeddings: Float32Array[], logIds: number[]): AnomalyResult[]
  cluster(embeddings: Float32Array[], logIds: number[], messages: string[]): ClusterResult[]
}

const analysisWorker: AnalysisWorkerAPI = {
  scoreAnomalies,
  cluster,
}

Comlink.expose(analysisWorker)
