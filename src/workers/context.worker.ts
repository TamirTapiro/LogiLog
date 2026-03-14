import * as Comlink from 'comlink'
import type { ContextWorkerOutput, WorkerLogEntry } from './worker.types'

export interface ContextWorker {
  extractContext(
    anchorLogId: number,
    precedingEntries: WorkerLogEntry[],
    relatedIds: number[],
    onResult: (output: ContextWorkerOutput) => void,
  ): Promise<void>
}

// Stub implementation — real implementation will use LLM/transformers for
// plain-English narrative generation from surrounding log context.
const worker: ContextWorker = {
  async extractContext(anchorLogId, precedingEntries, relatedIds, onResult) {
    // TODO: Generate narrative using transformers.js text generation model
    const preview =
      precedingEntries
        .slice(-3)
        .map((e) => e.message)
        .join(' | ') || 'No preceding context'

    onResult({
      type: 'context',
      anchorLogId,
      narrative: `Context around log ${anchorLogId}: ${preview}`,
      relatedLogIds: relatedIds,
    })
  },
}

Comlink.expose(worker)
