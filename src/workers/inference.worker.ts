import * as Comlink from 'comlink'
import { pipeline, env } from '@huggingface/transformers'
import { IDBModelCache } from './inferenceWorker/idbCache'
import type { CacheMeta } from './inferenceWorker/idbCache'

// Transformers.js configuration
env.backends.onnx.wasm.proxy = false
env.backends.onnx.wasm.numThreads = 4
env.allowRemoteModels = true

export type WorkerProgressEventType =
  | 'download-progress'
  | 'embed-progress'
  | 'ready'
  | 'error'

export interface WorkerProgressEvent {
  type: WorkerProgressEventType
  percent?: number
  embedded?: number
  total?: number
  message?: string
}

export interface InferenceWorkerAPI {
  initialize(
    onProgress: (event: WorkerProgressEvent) => void,
  ): Promise<{ device: string; modelId: string; dtype: string }>
  embed(texts: string[]): Promise<Float32Array[]>
  isReady(): boolean
}

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline<'feature-extraction'>>>

// Worker state
let _pipe: FeatureExtractionPipeline | null = null
let _ready = false
let _device = 'wasm'
let _modelId = 'Xenova/bge-small-en-v1.5'
let _dtype = 'q8'

const cache = new IDBModelCache()

async function negotiateDevice(): Promise<string> {
  try {
    if ('gpu' in navigator) {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()
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

const TRANSFORMERS_VERSION = '3.8.1'

function cacheKey(modelId: string, dtype: string): string {
  return `${modelId}:main:${dtype}:${TRANSFORMERS_VERSION}`
}

const inferenceWorker: InferenceWorkerAPI = {
  isReady() {
    return _ready
  },

  async initialize(onProgress) {
    // Step 1 — Device negotiation
    _device = await negotiateDevice()

    // Step 2 — Memory budget
    const { dtype, modelId } = negotiateMemory()
    _dtype = dtype
    _modelId = modelId

    // Steps 3–6 — Cache probe → download → persist
    try {
      await cache.open()
      const key = cacheKey(_modelId, _dtype)
      const cached = await cache.has(key)

      onProgress({ type: 'download-progress', percent: cached ? 100 : 0 })

      // Load with transformers.js (it handles download internally)
      // We hook into the progress callback for download reporting
      _pipe = await pipeline('feature-extraction', _modelId, {
        dtype: _dtype as 'q4' | 'q8',
        device: _device as 'webgpu' | 'wasm',
        progress_callback: (info: unknown) => {
          const p = info as Record<string, unknown>
          if (p['status'] === 'progress' && typeof p['progress'] === 'number') {
            onProgress({ type: 'download-progress', percent: p['progress'] as number })
          }
        },
      })

      // Step 7 — Warmup: run one dummy forward pass
      await _pipe(['warmup'], { pooling: 'mean', normalize: true })

      _ready = true
      onProgress({ type: 'ready' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onProgress({ type: 'error', message: msg })
      throw err
    }

    return { device: _device, modelId: _modelId, dtype: _dtype }
  },

  async embed(texts) {
    if (!_pipe) throw new Error('Inference worker not initialized')
    return embedTexts(_pipe, texts, undefined)
  },
}

const INFERENCE_BATCH_SIZE = 32

export async function embedTexts(
  pipe: FeatureExtractionPipeline,
  texts: string[],
  onProgress?: (embedded: number, total: number) => void,
): Promise<Float32Array[]> {
  const results: Float32Array[] = []
  const total = texts.length

  for (let i = 0; i < texts.length; i += INFERENCE_BATCH_SIZE) {
    const batch = texts.slice(i, i + INFERENCE_BATCH_SIZE)
    // Truncate each text to 512 chars as a proxy for token limit
    const truncated = batch.map((t) => t.slice(0, 512))

    const output = await pipe(truncated, { pooling: 'mean', normalize: false })

    // L2-normalize each output vector
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

function l2Normalize(v: Float32Array): void {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!
  const norm = Math.sqrt(sum)
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) v[i]! /= norm
  }
}

// Suppress unused import warning — cache is used in initialize()
const _cacheRef: IDBModelCache = cache
const _metaRef: CacheMeta | null = null
void _cacheRef
void _metaRef

Comlink.expose(inferenceWorker)
