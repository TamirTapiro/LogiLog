/**
 * Browser embedder — uses @huggingface/transformers with WebGPU/WASM backend.
 * Extracted from inference.worker.ts so it implements the shared Embedder interface.
 */

import { pipeline, env } from '@huggingface/transformers'
import { IDBModelCache } from '../../workers/inferenceWorker/idbCache'
import type { Embedder } from './embedder'
import { l2Normalize } from '../math/cosineSimilarity'

// Transformers.js configuration
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false
  env.backends.onnx.wasm.numThreads = 4
}
env.allowRemoteModels = true

const TRANSFORMERS_VERSION = '3.8.1'
const INFERENCE_BATCH_SIZE = 32

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline<'feature-extraction'>>>

async function negotiateDevice(): Promise<string> {
  try {
    if ('gpu' in navigator) {
      const adapter = await (
        navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }
      ).gpu.requestAdapter()
      if (adapter !== null) return 'webgpu'
    }
  } catch {
    // WebGPU not available
  }
  return 'wasm'
}

function negotiateMemory(): { dtype: 'q4' | 'q8'; modelId: string } {
  const mem = (performance as unknown as { memory?: { jsHeapSizeLimit: number } }).memory
  const heapLimit = mem?.jsHeapSizeLimit ?? Infinity
  if (heapLimit < 400 * 1024 * 1024) {
    return { dtype: 'q4', modelId: 'Xenova/all-MiniLM-L6-v2' }
  }
  return { dtype: 'q8', modelId: 'Xenova/bge-small-en-v1.5' }
}

function cacheKey(modelId: string, dtype: string): string {
  return `${modelId}:main:${dtype}:${TRANSFORMERS_VERSION}`
}

export class BrowserEmbedder implements Embedder {
  private pipe: FeatureExtractionPipeline | null = null
  private cache = new IDBModelCache()

  async initialize(onProgress?: (percent: number) => void): Promise<void> {
    const device = await negotiateDevice()
    const { dtype, modelId } = negotiateMemory()

    await this.cache.open()
    const key = cacheKey(modelId, dtype)
    const cached = await this.cache.has(key)

    onProgress?.(cached ? 100 : 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.pipe = await (pipeline as any)('feature-extraction', modelId, {
      dtype: dtype as 'q4' | 'q8',
      device: device as 'webgpu' | 'wasm',
      progress_callback: (info: unknown) => {
        const p = info as Record<string, unknown>
        if (p['status'] === 'progress' && typeof p['progress'] === 'number') {
          onProgress?.(p['progress'] as number)
        }
      },
    })

    // Warmup pass
    if (this.pipe) {
      await this.pipe(['warmup'], { pooling: 'mean', normalize: true })
    }

    onProgress?.(100)
  }

  async embed(
    texts: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Float32Array[]> {
    if (!this.pipe) throw new Error('BrowserEmbedder not initialized. Call initialize() first.')

    const results: Float32Array[] = []
    const total = texts.length

    for (let i = 0; i < texts.length; i += INFERENCE_BATCH_SIZE) {
      const batch = texts.slice(i, i + INFERENCE_BATCH_SIZE)
      const truncated = batch.map((t) => t.slice(0, 512))

      const output = await this.pipe(truncated, { pooling: 'mean', normalize: false })

      const tensor = output.tolist() as number[][]
      for (const vec of tensor) {
        const fa = new Float32Array(vec)
        l2Normalize(fa)
        results.push(fa)
      }

      onProgress?.(Math.min(i + INFERENCE_BATCH_SIZE, total), total)
    }

    return results
  }

  dispose(): void {
    this.pipe = null
  }
}
