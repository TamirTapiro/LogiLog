import * as Comlink from 'comlink'
import type { InferenceWorkerOutput } from './worker.types'

export interface InferenceWorker {
  isReady(): Promise<boolean>
  embed(
    messages: string[],
    ids: number[],
    onResult: (output: InferenceWorkerOutput) => void,
  ): Promise<void>
}

// Stub implementation — real implementation will use @huggingface/transformers
// Once the model is loaded this worker generates embedding vectors per log message.
const worker: InferenceWorker = {
  async isReady() {
    // TODO: Initialize transformers.js pipeline here
    return false
  },

  async embed(_messages, ids, onResult) {
    // TODO: Run transformers pipeline and emit vectors via Transferable Float32Array
    onResult({
      type: 'embeddings',
      ids,
      vectors: ids.map(() => new Float32Array(384)),
    })
  },
}

Comlink.expose(worker)
