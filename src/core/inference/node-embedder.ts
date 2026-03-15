/**
 * Node.js embedder — uses @huggingface/transformers with onnxruntime-node.
 * Replaces three browser-only APIs from inference.worker.ts:
 *   - negotiateDevice: uses CPU via onnxruntime-node instead of navigator.gpu
 *   - negotiateMemory: uses process.memoryUsage() instead of performance.memory
 *   - IDBModelCache: uses fs-based cache via env.cacheDir
 */

import type { Embedder } from './embedder'
import { l2Normalize } from '../math/cosineSimilarity'
import * as path from 'path'
import * as os from 'os'

const MODEL_ID = 'Xenova/bge-small-en-v1.5'
const MODEL_ID_SMALL = 'Xenova/all-MiniLM-L6-v2'
const INFERENCE_BATCH_SIZE = 32

type FeatureExtractionPipeline = {
  (
    texts: string[],
    options: { pooling: string; normalize: boolean },
  ): Promise<{ tolist(): number[][] }>
}

export class NodeEmbedder implements Embedder {
  private pipe: FeatureExtractionPipeline | null = null
  private modelId = MODEL_ID
  private dtype: 'q4' | 'q8' = 'q8'
  private cacheDir: string

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? path.join(os.homedir(), '.cache', 'logilog', 'models')
  }

  async initialize(onProgress?: (percent: number) => void): Promise<void> {
    // Dynamic import so this module can be loaded without onnxruntime-node installed
    // (the import will throw a helpful error if it's missing)
    let transformers: typeof import('@huggingface/transformers')
    try {
      transformers = await import('@huggingface/transformers')
    } catch {
      throw new Error(
        'onnxruntime-node is required for Node.js. Run: npm install onnxruntime-node',
      )
    }

    const { pipeline, env } = transformers

    // Configure for Node.js: use onnxruntime-node backend (CPU)
    if (env.backends?.onnx?.wasm) {
      // Disable WASM proxy — not needed in Node.js
      env.backends.onnx.wasm.proxy = false
    }
    env.allowRemoteModels = true

    // Use fs-based cache instead of IndexedDB
    env.cacheDir = this.cacheDir

    // Memory negotiation via process.memoryUsage() instead of performance.memory
    const mem = process.memoryUsage()
    const heapLimit = mem.heapTotal + (mem.external ?? 0)
    if (heapLimit < 400 * 1024 * 1024) {
      this.dtype = 'q4'
      this.modelId = MODEL_ID_SMALL
    } else {
      this.dtype = 'q8'
      this.modelId = MODEL_ID
    }

    onProgress?.(0)

    // Load pipeline — Transformers.js handles download + caching to env.cacheDir
    this.pipe = (await (pipeline as unknown as (
      task: string,
      model: string,
      options: Record<string, unknown>,
    ) => Promise<FeatureExtractionPipeline>)('feature-extraction', this.modelId, {
      dtype: this.dtype,
      device: 'cpu',
      progress_callback: (info: unknown) => {
        const p = info as Record<string, unknown>
        if (p['status'] === 'progress' && typeof p['progress'] === 'number') {
          // Print download progress to stderr, not stdout
          process.stderr.write(
            `\rDownloading model: ${(p['progress'] as number).toFixed(1)}%   `,
          )
          onProgress?.(p['progress'] as number)
        }
      },
    })) as unknown as FeatureExtractionPipeline

    // Warmup pass
    if (this.pipe) {
      await this.pipe(['warmup'], { pooling: 'mean', normalize: false })
    }

    // Clear progress line
    process.stderr.write('\r\x1b[K')
    onProgress?.(100)
  }

  async embed(
    texts: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Float32Array[]> {
    if (!this.pipe) throw new Error('NodeEmbedder not initialized. Call initialize() first.')

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
