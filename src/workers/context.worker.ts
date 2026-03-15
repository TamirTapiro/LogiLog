import * as Comlink from 'comlink'
import type { SmartContext } from '../types/analysis.types'
import type { LogEntry } from '../types/log.types'
import { extractContext } from '../core/context'

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
