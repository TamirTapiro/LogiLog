# LogiLog Inference Engine Specification

**Version:** 1.0
**Status:** Production Specification
**Audience:** ML Engineers, Frontend Engineers implementing the inference subsystem

---

## Table of Contents

1. [Model Selection](#1-model-selection)
2. [Quantization Strategy](#2-quantization-strategy)
3. [Model Loading Pipeline](#3-model-loading-pipeline)
4. [Embedding Generation Pipeline](#4-embedding-generation-pipeline)
5. [Anomaly Detection Algorithm](#5-anomaly-detection-algorithm)
6. [Smart Context Algorithm](#6-smart-context-algorithm)
7. [Clustering Algorithm](#7-clustering-algorithm)
8. [Performance Optimization](#8-performance-optimization)
9. [Web Worker Architecture](#9-web-worker-architecture)
10. [Fallback Strategy](#10-fallback-strategy)
11. [Evaluation Metrics](#11-evaluation-metrics)
12. [Model Update Strategy](#12-model-update-strategy)

---

## 1. Model Selection

### 1.1 Candidate Models

All candidate models must satisfy the following hard constraints:

- Compatible with Transformers.js v3 (`@xenova/transformers` or `@huggingface/transformers`)
- Available on HuggingFace Hub in ONNX format (required for Transformers.js)
- Pre-quantized variants available (q4 or q8) to avoid in-browser quantization overhead
- Peak memory under 150MB at q4 to leave headroom within the 2GB browser budget
- Embedding dimension sufficient for fine-grained cosine distance discrimination

| Model                      | Size (fp32) | Size (q8) | Size (q4) | Embedding Dim | Sequence Limit | WebGPU Speed\* |
| -------------------------- | ----------- | --------- | --------- | ------------- | -------------- | -------------- |
| `Xenova/all-MiniLM-L6-v2`  | 90MB        | ~45MB     | ~23MB     | 384           | 256 tokens     | ~8ms/batch     |
| `Xenova/bge-small-en-v1.5` | 134MB       | ~67MB     | ~34MB     | 384           | 512 tokens     | ~11ms/batch    |
| `Xenova/all-MiniLM-L12-v2` | 134MB       | ~67MB     | ~34MB     | 384           | 256 tokens     | ~14ms/batch    |
| `Xenova/bge-base-en-v1.5`  | 438MB       | ~219MB    | ~110MB    | 768           | 512 tokens     | ~28ms/batch    |
| `Xenova/gte-small`         | 67MB        | ~34MB     | ~17MB     | 384           | 512 tokens     | ~7ms/batch     |

\*Estimated batch inference time for 32 sequences on a mid-tier discrete GPU (Apple M2, RTX 3060 class).

### 1.2 Recommendation: `Xenova/bge-small-en-v1.5` (Primary)

**Selected model:** `Xenova/bge-small-en-v1.5` at `q8` quantization.

**Rationale:**

1. **Sequence length (512 tokens):** Log lines with stack traces, JSON payloads, or structured metadata routinely exceed 256 tokens. MiniLM-L6 at 256-token limit would silently truncate critical forensic signal (e.g., exception class names buried in a Java stack trace). BGE-small handles 512 tokens, capturing full structured log payloads within a single embedding call.

2. **Embedding quality for domain text:** BGE (BAAI General Embedding) models are trained with retrieval-focused contrastive objectives that produce tighter intra-cluster distances and sharper inter-cluster separation than MiniLM's knowledge-distilled objective. For anomaly detection via cosine distance, this translates to a cleaner decision boundary between "normal" and "anomalous" regions of embedding space.

3. **Size vs. quality tradeoff:** At q8, BGE-small is 67MB on disk — well within the 150MB per-model budget. At q4, it drops to 34MB with acceptable quality loss for log-domain text (logs are lexically repetitive; precision loss from 4-bit is less harmful than it would be for general NLP tasks).

4. **Competitive inference speed:** 11ms/batch (32 sequences) on WebGPU puts end-to-end latency for a 1000-line log file at under 350ms — acceptable for interactive use.

**Fallback model:** `Xenova/all-MiniLM-L6-v2` at `q4` — used when device memory is constrained (detected via `performance.memory` if available, or heuristically on low-end devices). At 23MB, it fits even on mobile browser tabs, though anomaly sensitivity will be lower.

### 1.3 Why Not Larger Models

`bge-base-en-v1.5` at 768 dimensions would improve cluster separation but at 219MB (q8) consumes too large a fraction of the 2GB browser budget when combined with the application heap, WASM runtime, and WebGPU buffer allocations. The marginal quality improvement does not justify the memory cost or the 2.5x inference slowdown.

---

## 2. Quantization Strategy

### 2.1 Quantization Background

Linear quantization maps a 32-bit floating-point weight `W` to an integer representation via:

```
Q(W) = round(W / S + Z)
```

Where `S` is the scale factor and `Z` is the zero-point, as specified in the seed document. The inverse (dequantization) reconstructs an approximation of `W` at inference time. For 8-bit quantization, weights occupy 1 byte instead of 4, yielding a theoretical 4x memory reduction. For 4-bit, weights occupy half a byte, yielding 8x reduction — but with meaningful precision loss in activations.

### 2.2 Quantization Configurations

LogiLog uses **pre-quantized ONNX models** from HuggingFace Hub rather than performing in-browser quantization. In-browser quantization is not supported by Transformers.js v3 and would require shipping a quantization runtime that adds unacceptable startup latency.

**Tier 1 (default, high-memory devices):** `q8` — int8 weights, fp32 activations

- 67MB for bge-small
- Accuracy degradation vs. fp32: <0.3% on MTEB retrieval benchmarks
- Sufficient precision for cosine distance discrimination in log embedding space
- Load via `dtype: 'q8'` in Transformers.js v3

**Tier 2 (constrained devices):** `q4` — int4 weights, fp32 activations

- 34MB for bge-small
- Accuracy degradation vs. fp32: ~1-2% on MTEB
- Acceptable for log-domain anomaly detection; logs are lexically repetitive so embedding space is relatively coarse
- Load via `dtype: 'q4'` in Transformers.js v3

**Tier 3 (emergency fallback):** `q4f16` — int4 weights, fp16 activations

- Smallest memory footprint
- Only used when WASM fallback path is active (see Section 10)

**Mixed quantization (not recommended):** Mixed per-layer quantization (e.g., keeping attention layers in fp16, FFN in q4) is not directly configurable via the Transformers.js v3 public API at time of writing. The `dtype` parameter applies uniformly to the ONNX session. If HuggingFace ships mixed-precision ONNX variants for BGE models, LogiLog should prefer those.

### 2.3 Loading Quantized Models with Transformers.js v3

```typescript
import { pipeline, env } from '@huggingface/transformers'

// Configure environment before first pipeline call
env.backends.onnx.wasm.proxy = false // Use direct WASM, not proxied (Worker context)
env.backends.onnx.wasm.numThreads = 4 // Match Worker thread pool
env.allowRemoteModels = true
env.cacheDir = '/LogiLog-models' // Virtual path; actual storage is IndexedDB via custom cache

const embedder = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
  device: 'webgpu', // Primary compute backend
  dtype: 'q8', // int8 quantization
  revision: 'main', // Pin to specific HF repo revision for reproducibility
})
```

---

## 3. Model Loading Pipeline

### 3.1 Overview

The loading pipeline must reduce perceived latency on repeat visits to under 3 seconds. On first load, the download (67MB for q8 bge-small) takes 10-30 seconds depending on connection speed — this is unavoidable and must be communicated clearly to the user (see Section 3.5 on progress reporting).

### 3.2 Cache Key Design

IndexedDB stores model files keyed by a compound identifier:

```
{modelId}:{revision}:{dtype}:{transformersJsVersion}
```

Example: `Xenova/bge-small-en-v1.5:main:q8:3.1.0`

The Transformers.js version is included because ONNX session format compatibility is version-dependent. A Transformers.js upgrade may invalidate cached models.

### 3.3 Step-by-Step Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Model Loading Pipeline                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: RESOLVE DEVICE CAPABILITY
  ├─ Check navigator.gpu (WebGPU)
  ├─ If unavailable → set backend = 'wasm', dtype = 'q4', model = MiniLM-L6
  └─ If available → set backend = 'webgpu', dtype = 'q8', model = bge-small

Step 2: CHECK MEMORY BUDGET
  ├─ If performance.memory available: check jsHeapSizeLimit
  ├─ If estimated available heap < 400MB → downgrade to Tier 2 (q4)
  └─ Proceed with selected tier

Step 3: PROBE INDEXEDDB CACHE
  ├─ Open IDB store 'LogiLog-model-cache'
  ├─ Lookup key: {modelId}:{revision}:{dtype}:{transformersJsVersion}
  ├─ If HIT and integrity check passes → Step 6 (Deserialize)
  └─ If MISS or corrupt → Step 4 (Download)

Step 4: DOWNLOAD FROM HUGGINGFACE HUB
  ├─ Transformers.js handles chunked download via fetch()
  ├─ Emit progress events to UI thread (0% → 100%)
  ├─ Files: model.onnx (or model_quantized.onnx), tokenizer.json,
  │         tokenizer_config.json, config.json, special_tokens_map.json
  └─ Store raw ArrayBuffer chunks as received

Step 5: WRITE TO INDEXEDDB
  ├─ Open IDB transaction (readwrite) on 'LogiLog-model-cache'
  ├─ Store each file as ArrayBuffer with metadata:
  │   { key, sizeBytes, downloadedAt, sha256 }
  ├─ Compute SHA-256 via SubtleCrypto for integrity verification
  └─ Commit transaction; emit 'cached' event

Step 6: DESERIALIZE AND CREATE ONNX SESSION
  ├─ Pass ArrayBuffers to Transformers.js via custom cache implementation
  │   (override env.cacheDir with custom CacheManager, see 3.4)
  ├─ Transformers.js creates InferenceSession via ONNX Runtime Web
  └─ WebGPU: ONNX Runtime compiles WGSL shaders (first time: +2-5 seconds)

Step 7: WARM UP
  ├─ Run single dummy forward pass: tokenize(['warmup']), embed
  ├─ Forces shader compilation and GPU buffer allocation
  ├─ Discards output; subsequent calls use compiled pipeline
  └─ Emit 'ready' event to UI thread
```

### 3.4 Custom IndexedDB Cache Manager

Transformers.js v3 uses the browser Cache API or a custom storage backend. LogiLog must intercept the file resolution to serve from IndexedDB:

```typescript
// inferenceWorker/idbCache.ts

const DB_NAME = 'LogiLog-model-cache'
const DB_VERSION = 1
const STORE_NAME = 'model-files'

interface CachedFile {
  key: string
  data: ArrayBuffer
  sizeBytes: number
  downloadedAt: number
  sha256: string
  transformersVersion: string
}

export class IDBModelCache {
  private db: IDBDatabase | null = null

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    if (!this.db) throw new Error('IDB not open')
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => {
        const record = req.result as CachedFile | undefined
        resolve(record?.data ?? null)
      }
      req.onerror = () => reject(req.error)
    })
  }

  async put(key: string, data: ArrayBuffer, meta: Omit<CachedFile, 'key' | 'data'>): Promise<void> {
    if (!this.db) throw new Error('IDB not open')
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const record: CachedFile = { key, data, ...meta }
      const req = tx.objectStore(STORE_NAME).put(record)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async has(key: string): Promise<boolean> {
    const data = await this.get(key)
    return data !== null
  }

  async estimatedSizeBytes(): Promise<number> {
    if (!this.db) return 0
    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).getAll()
      req.onsuccess = () => {
        const records = req.result as CachedFile[]
        resolve(records.reduce((sum, r) => sum + r.sizeBytes, 0))
      }
      req.onerror = () => resolve(0)
    })
  }
}
```

### 3.5 Progress Reporting

The model loading pipeline emits typed progress messages to the UI thread via the Worker message protocol (see Section 9). The UI must display a loading state within 5 seconds as specified in the seed document.

```typescript
// Progress event stages
type LoadStage =
  | 'detecting-capabilities'
  | 'checking-cache'
  | 'downloading' // includes % complete
  | 'writing-cache'
  | 'creating-session'
  | 'compiling-shaders' // WebGPU shader compilation
  | 'warming-up'
  | 'ready'
  | 'error'
```

---

## 4. Embedding Generation Pipeline

### 4.1 Log Line Preprocessing

Before tokenization, each log line undergoes lightweight normalization to improve embedding consistency without destroying semantic content:

```typescript
// inferenceWorker/preprocess.ts

/**
 * Normalize a raw log line for embedding.
 * Goals:
 *   - Reduce token count for high-cardinality fields (UUIDs, IPs, timestamps)
 *   - Preserve semantic signal (error types, service names, status codes)
 *   - Stay within 512-token sequence limit
 */
export function preprocessLogLine(raw: string): string {
  let line = raw

  // 1. Strip leading timestamp (ISO 8601 and common variants)
  //    Timestamps consume tokens but carry no semantic anomaly signal
  //    (we use structural position for temporal context, not the timestamp token)
  line = line.replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?\s*/, '')

  // 2. Normalize UUIDs to a sentinel token
  line = line.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')

  // 3. Normalize IP addresses
  line = line.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, '<IP>')

  // 4. Normalize hex addresses and large hex literals (memory addresses, hashes)
  line = line.replace(/\b0x[0-9a-f]{6,}\b/gi, '<HEX>')

  // 5. Normalize file paths (keep basename for semantic signal)
  line = line.replace(/(?:\/[\w.-]+)+\/([\w.-]+\.\w+)/g, '<PATH>/$1')

  // 6. Normalize long numeric sequences (request IDs, trace IDs)
  line = line.replace(/\b\d{10,}\b/g, '<ID>')

  // 7. Truncate to 400 characters max before tokenization
  //    BGE-small tokenizes at ~3-4 chars/token average; 400 chars ≈ 130 tokens,
  //    well within 512 limit even for subword-heavy log text
  if (line.length > 400) {
    line = line.slice(0, 397) + '...'
  }

  return line.trim()
}
```

**What is preserved:** Error class names (`NullPointerException`, `ECONNREFUSED`), HTTP status codes (`500`, `404`), service/component names, severity levels (`ERROR`, `WARN`, `FATAL`), log categories, structured key names in JSON payloads.

**What is normalized:** UUIDs, IPs, timestamps, memory addresses, large numeric IDs. These are high-cardinality tokens that would push semantically identical log lines far apart in embedding space despite being operationally equivalent.

### 4.2 Batch Construction

```typescript
// inferenceWorker/batchBuilder.ts

export interface LogBatch {
  lines: string[] // Preprocessed log text
  originalIndices: number[] // Line numbers in the original file
  batchId: number
}

const BATCH_SIZE = 32 // Optimal for WebGPU: fills GPU pipeline without exceeding VRAM buffer limits
const MAX_BATCH_SIZE = 64 // Upper bound; above this, WebGPU buffer allocation can OOM on 4GB VRAM devices

/**
 * Partition a flat array of preprocessed log lines into fixed-size batches.
 * Preserves original line indices for result reassembly.
 */
export function buildBatches(
  lines: string[],
  originalIndices: number[],
  batchSize: number = BATCH_SIZE,
): LogBatch[] {
  const batches: LogBatch[] = []
  for (let i = 0; i < lines.length; i += batchSize) {
    batches.push({
      lines: lines.slice(i, i + batchSize),
      originalIndices: originalIndices.slice(i, i + batchSize),
      batchId: batches.length,
    })
  }
  return batches
}
```

**Batch size rationale:**

- Batch size 32 is chosen as the default based on empirical WebGPU throughput curves. WebGPU command encoding overhead per dispatch is amortized across the batch; below 16 items the overhead dominates. Above 64 items, activation tensors for the 512-sequence-length BGE-small model exceed 256MB of GPU VRAM per batch.
- For the WASM fallback (Section 10), batch size should be reduced to 8 to avoid blocking the Worker event loop for more than 100ms per batch.

### 4.3 Embedding Execution

```typescript
// inferenceWorker/embedder.ts

import { pipeline, env } from '@huggingface/transformers'

type EmbeddingPipeline = Awaited<ReturnType<typeof pipeline>>

export interface EmbeddingResult {
  embeddings: Float32Array[] // One per log line, shape [embeddingDim]
  originalIndices: number[] // Corresponds to input batch indices
  batchId: number
  inferenceMs: number
}

export async function embedBatch(
  embedder: EmbeddingPipeline,
  batch: LogBatch,
): Promise<EmbeddingResult> {
  const t0 = performance.now()

  // Transformers.js v3: pipeline returns a Tensor or nested Tensor structure
  // For feature-extraction, output shape is [batchSize, sequenceLength, hiddenDim]
  // We apply mean pooling over the sequence dimension to get [batchSize, hiddenDim]
  const output = await embedder(batch.lines, {
    pooling: 'mean', // Mean pool over token dimension
    normalize: true, // L2-normalize; required for cosine distance = 1 - dot product
    batch_size: batch.lines.length,
  })

  // output.data is a flat Float32Array of shape [batchSize * embeddingDim]
  const embeddingDim = output.dims[output.dims.length - 1] as number
  const embeddings: Float32Array[] = []

  for (let i = 0; i < batch.lines.length; i++) {
    const start = i * embeddingDim
    // Slice creates a view, not a copy — use .slice() not .subarray()
    // to allow independent transfer to main thread
    embeddings.push(new Float32Array(output.data.buffer, start * 4, embeddingDim).slice())
  }

  return {
    embeddings,
    originalIndices: batch.originalIndices,
    batchId: batch.batchId,
    inferenceMs: performance.now() - t0,
  }
}
```

**Note on normalization:** Setting `normalize: true` in the pipeline call ensures all embedding vectors have unit L2 norm. This is critical because it reduces cosine distance computation to a simple dot product:

```
cosine_distance(A, B) = 1 - dot(A, B)    [when A and B are unit vectors]
```

This avoids two `sqrt` operations per distance computation, which matters at scale when computing pairwise distances across thousands of log embeddings.

### 4.4 Variable-Length Log Line Handling

BGE-small's 512-token limit handles the vast majority of log lines. For pathological cases (e.g., a log line containing a full JSON blob or a multi-kilobyte stack trace):

1. The preprocessing step (Section 4.1) truncates to 400 characters, which caps token count at approximately 200 tokens under worst-case subword tokenization.
2. Transformers.js automatically handles padding within a batch to the length of the longest sequence (dynamic padding), so short log lines do not waste computation.
3. Lines that are empty after preprocessing (e.g., blank separator lines) are assigned a zero embedding and an anomaly score of 0.0 (not anomalous by definition).

---

## 5. Anomaly Detection Algorithm

### 5.1 Architecture Decision: Sliding Window over Batch Processing

LogiLog uses a **sliding window** approach rather than pure batch processing for anomaly scoring. The rationale:

- **Batch processing** scores each line against the global mean embedding of all other lines. This works for detecting rare global outliers but misses local anomalies: a log line that is normal at 3AM but highly anomalous at 10AM (during a deployment) would score normally against the full-file mean.
- **Sliding window** scores each line against the recent historical baseline (the N lines immediately preceding it). This captures temporal locality — the relevant definition of "normal" shifts as the system's state evolves.
- The window size is configurable but defaults to 200 lines of history, representing approximately 2-5 minutes of log output in typical high-traffic services.

### 5.2 Baseline "Normal" Pattern Building

The baseline is represented as a **rolling centroid** — the mean of all embeddings in the sliding history window. This is computationally cheap (O(1) update per new embedding) and sufficient because:

1. Log embedding spaces for healthy systems are relatively tight clusters (high lexical repetition → nearby embeddings).
2. The centroid approximates the "center of gravity" of normal behavior well when the history is dominated by routine operational logs.

```typescript
// inferenceWorker/baseline.ts

export class RollingBaseline {
  private centroid: Float32Array
  private windowEmbeddings: Float32Array[]
  private windowSize: number
  private embeddingDim: number
  private count: number

  constructor(embeddingDim: number, windowSize: number = 200) {
    this.embeddingDim = embeddingDim
    this.windowSize = windowSize
    this.centroid = new Float32Array(embeddingDim)
    this.windowEmbeddings = []
    this.count = 0
  }

  /**
   * Add a new embedding to the rolling window.
   * Evicts the oldest if at capacity and updates centroid incrementally.
   */
  update(embedding: Float32Array): void {
    if (this.windowEmbeddings.length >= this.windowSize) {
      // Remove oldest from centroid
      const oldest = this.windowEmbeddings.shift()!
      for (let i = 0; i < this.embeddingDim; i++) {
        this.centroid[i] -= oldest[i] / this.windowSize
      }
    }

    this.windowEmbeddings.push(embedding)
    const n = this.windowEmbeddings.length
    for (let i = 0; i < this.embeddingDim; i++) {
      this.centroid[i] = this.centroid[i] * ((n - 1) / n) + embedding[i] / n
    }
    this.count++
  }

  getCentroid(): Float32Array {
    return this.centroid
  }

  isWarm(): boolean {
    // Baseline is considered warm after seeing at least 50 lines
    return this.windowEmbeddings.length >= 50
  }

  getWindowSize(): number {
    return this.windowEmbeddings.length
  }
}
```

**Cold-start handling:** The first 50 lines are embedded and accumulated into the baseline without anomaly scoring. This prevents false positives at the start of a log file where any single log line would appear anomalous against an empty baseline.

### 5.3 Cosine Distance Calculation

```typescript
// inferenceWorker/distance.ts

/**
 * Compute cosine distance between two L2-normalized unit vectors.
 * Since both vectors are unit norm (enforced by embedder normalize=true),
 * cosine similarity = dot product, and distance = 1 - dot product.
 *
 * Time complexity: O(d) where d = embedding dimension (384 for bge-small)
 */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0.0
  // Unrolled loop for modest SIMD-friendly gains in JS engines
  const len = a.length
  let i = 0
  for (; i + 3 < len; i += 4) {
    dot += a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3]
  }
  for (; i < len; i++) {
    dot += a[i] * b[i]
  }
  // Clamp to [0, 2] to guard against floating-point drift beyond [-1, 1] dot range
  return Math.max(0, Math.min(2, 1 - dot))
}

/**
 * Score a candidate embedding against the current baseline centroid.
 * Returns a value in [0, 2] where:
 *   0.0  = identical to baseline centroid (perfectly normal)
 *   0.3+ = meaningfully different (investigate)
 *   0.5+ = high anomaly confidence
 *   1.0+ = semantically orthogonal to baseline (very strong signal)
 */
export function scoreAgainstBaseline(candidate: Float32Array, baseline: RollingBaseline): number {
  if (!baseline.isWarm()) return 0.0 // No score during cold-start
  return cosineDistance(candidate, baseline.getCentroid())
}
```

### 5.4 Anomaly Threshold Tuning

**Static threshold (default):** `0.35`

A cosine distance of 0.35 from the rolling centroid is a conservative threshold derived from empirical observation of log embedding distributions:

- Routine operational logs (health checks, metrics, DB queries) cluster within 0.0-0.15 of each other.
- Minor variations (different DB query patterns, varying HTTP paths) score 0.15-0.30.
- Meaningfully different events (errors, exceptions, service restarts, auth failures) typically score 0.30-0.60.
- Novel or catastrophic events (OOM kills, kernel panics, security alerts) score above 0.60.

**Adaptive threshold (recommended for production use):**

The static threshold is inadequate for log files with high intrinsic variance (e.g., event-driven microservices emitting diverse message types routinely). The adaptive threshold uses a rolling statistical model of recent anomaly scores:

```typescript
// inferenceWorker/adaptiveThreshold.ts

export class AdaptiveThreshold {
  private recentScores: number[] = []
  private maxHistory: number

  // Static baseline for cold start (before we have score history)
  private readonly STATIC_THRESHOLD = 0.35
  private readonly Z_SCORE_MULTIPLIER = 2.5 // Flag lines > 2.5 std devs above mean

  constructor(maxHistory: number = 500) {
    this.maxHistory = maxHistory
  }

  record(score: number): void {
    this.recentScores.push(score)
    if (this.recentScores.length > this.maxHistory) {
      this.recentScores.shift()
    }
  }

  getThreshold(): number {
    if (this.recentScores.length < 100) {
      return this.STATIC_THRESHOLD
    }

    const n = this.recentScores.length
    const mean = this.recentScores.reduce((a, b) => a + b, 0) / n
    const variance = this.recentScores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / n
    const stdDev = Math.sqrt(variance)

    // Threshold = mean + k*sigma, minimum floor of 0.20 to avoid trivial flagging
    // in high-variance log files
    return Math.max(0.2, mean + this.Z_SCORE_MULTIPLIER * stdDev)
  }

  isAnomalous(score: number): boolean {
    return score > this.getThreshold()
  }
}
```

**Threshold calibration guidance:**

| Log Source Type                  | Recommended Z-Score Multiplier | Expected Threshold Range |
| -------------------------------- | ------------------------------ | ------------------------ |
| Kubernetes control plane         | 2.0                            | 0.28-0.40                |
| Application server (homogeneous) | 2.5                            | 0.30-0.45                |
| Event-driven microservices       | 3.0                            | 0.35-0.55                |
| Mixed/polyglot multi-service     | 3.5                            | 0.40-0.65                |

### 5.5 Volume Spikes vs. Semantic Anomalies

A volume spike (log rate 10x above normal) is not inherently a semantic anomaly — it may simply be a traffic surge producing more of the same healthy log lines. LogiLog must distinguish:

- **Semantic anomaly:** A log line whose _content_ is unusual, regardless of volume.
- **Volume anomaly:** An unusual _rate_ of any log lines (including routine ones).

The embedding-based cosine distance captures semantic anomalies. Volume anomalies are detected separately via a time-bucketed rate counter:

```typescript
// inferenceWorker/volumeDetector.ts

export class VolumeAnomalyDetector {
  private buckets: Map<number, number> = new Map() // bucketTimestamp -> lineCount
  private bucketSizeMs: number
  private historyBuckets: number

  constructor(bucketSizeMs: number = 5000, historyBuckets: number = 60) {
    this.bucketSizeMs = bucketSizeMs // 5-second buckets
    this.historyBuckets = historyBuckets // 5 minutes of history
  }

  /**
   * Record lines at a given log timestamp (parsed from log, not wall clock).
   * Returns true if this bucket represents a volume spike.
   */
  record(logTimestampMs: number, lineCount: number = 1): boolean {
    const bucket = Math.floor(logTimestampMs / this.bucketSizeMs) * this.bucketSizeMs
    this.buckets.set(bucket, (this.buckets.get(bucket) ?? 0) + lineCount)
    this.evictOldBuckets(logTimestampMs)
    return this.isSpiking(bucket)
  }

  private evictOldBuckets(currentMs: number): void {
    const cutoff = currentMs - this.historyBuckets * this.bucketSizeMs
    for (const [ts] of this.buckets) {
      if (ts < cutoff) this.buckets.delete(ts)
    }
  }

  private isSpiking(currentBucket: number): boolean {
    const counts = Array.from(this.buckets.values())
    if (counts.length < 10) return false // Not enough history
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    const current = this.buckets.get(currentBucket) ?? 0
    return current > mean * 3 // 3x average rate = volume spike
  }
}
```

The anomaly output for each flagged line includes both `isSemanticAnomaly` and `isVolumeAnomaly` booleans, allowing the UI to annotate them differently.

### 5.6 Full Anomaly Scoring Loop

```typescript
// inferenceWorker/anomalyScorer.ts

export interface AnomalyScore {
  lineIndex: number
  score: number // Cosine distance from baseline centroid [0, 2]
  isSemanticAnomaly: boolean
  isVolumeAnomaly: boolean
  threshold: number // Threshold that was active at scoring time
  baselineSize: number // How many lines were in the baseline window
}

export async function runAnomalyScoring(
  embedder: EmbeddingPipeline,
  logLines: string[],
  logTimestampsMs: number[], // Parsed timestamps (same length as logLines)
  onProgress: (processed: number, total: number) => void,
  onAnomaly: (anomaly: AnomalyScore) => void,
): Promise<AnomalyScore[]> {
  const EMBEDDING_DIM = 384 // bge-small output dimension
  const baseline = new RollingBaseline(EMBEDDING_DIM, 200)
  const threshold = new AdaptiveThreshold(500)
  const volumeDetector = new VolumeAnomalyDetector(5000, 60)
  const allScores: AnomalyScore[] = []

  const batches = buildBatches(
    logLines.map(preprocessLogLine),
    logLines.map((_, i) => i),
    32,
  )

  for (const batch of batches) {
    const result = await embedBatch(embedder, batch)

    for (let i = 0; i < result.embeddings.length; i++) {
      const embedding = result.embeddings[i]
      const lineIndex = result.originalIndices[i]
      const logTs = logTimestampsMs[lineIndex] ?? 0

      const score = scoreAgainstBaseline(embedding, baseline)
      const isVolumeAnomaly = volumeDetector.record(logTs)

      threshold.record(score)
      const currentThreshold = threshold.getThreshold()
      const isSemanticAnomaly = baseline.isWarm() && score > currentThreshold

      baseline.update(embedding)

      const anomalyScore: AnomalyScore = {
        lineIndex,
        score,
        isSemanticAnomaly,
        isVolumeAnomaly,
        threshold: currentThreshold,
        baselineSize: baseline.getWindowSize(),
      }

      allScores.push(anomalyScore)
      if (isSemanticAnomaly || isVolumeAnomaly) {
        onAnomaly(anomalyScore)
      }
    }

    onProgress(Math.min((batch.batchId + 1) * 32, logLines.length), logLines.length)

    // Yield to Worker event loop between batches to allow message processing
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return allScores
}
```

---

## 6. Smart Context Algorithm

### 6.1 Purpose

When a semantic anomaly is detected at line `N`, the Smart Context algorithm identifies the 50-100 lines preceding `N` that best explain the causal chain leading to the anomaly. Not all preceding lines are equally relevant — routine health checks and unrelated service logs should be deprioritized in favor of lines that represent an escalating failure pattern.

### 6.2 Algorithm Specification

The algorithm operates in two phases:

**Phase 1: Candidate Collection**

Collect the 200 lines immediately preceding the anomaly line (configurable, default 200 to handle slow-developing failure chains). This is the raw context window.

**Phase 2: Relevance Scoring and Selection**

Score each candidate line for relevance to the detected anomaly using a combination of:

1. **Semantic proximity:** Cosine similarity between the candidate embedding and the anomaly embedding. Lines semantically close to the anomaly (e.g., preceding error messages of the same class) score high.

2. **Temporal recency:** Lines closer in time to the anomaly receive a linear recency boost. A line 5 lines before the anomaly is 10x more likely to be relevant than one 200 lines before.

3. **Severity signal:** Lines containing known severity markers (`ERROR`, `FATAL`, `WARN`, `Exception`, `panic`, `CRITICAL`, `failed`, `timeout`, `refused`) receive a fixed boost of +0.2.

4. **Causal keyword signal:** Lines containing causal language (`caused by`, `due to`, `triggered by`, `because`, `failed to`, `unable to`, `OOM`, `killed`, `evicted`) receive a fixed boost of +0.15.

```typescript
// inferenceWorker/smartContext.ts

const SEVERITY_PATTERN =
  /\b(ERROR|FATAL|WARN|Exception|panic|CRITICAL|failed|timeout|refused|abort|killed|evicted)\b/i
const CAUSAL_PATTERN =
  /\b(caused.by|due.to|triggered.by|because|failed.to|unable.to|OOM|out.of.memory|connection.refused)\b/i

export interface SmartContextLine {
  lineIndex: number
  text: string
  relevanceScore: number
  distanceToAnomaly: number // Lines between this line and the anomaly
}

export interface SmartContext {
  anomalyLineIndex: number
  contextLines: SmartContextLine[] // Top 50-100 most relevant, sorted by lineIndex
  capturedAt: number // Wall clock timestamp
}

export function computeSmartContext(
  anomalyLineIndex: number,
  anomalyEmbedding: Float32Array,
  allEmbeddings: Float32Array[], // Embeddings for all lines (index-aligned)
  allLogLines: string[],
  contextWindowSize: number = 200,
  targetContextLines: number = 75,
): SmartContext {
  const start = Math.max(0, anomalyLineIndex - contextWindowSize)
  const candidates: SmartContextLine[] = []

  for (let i = start; i < anomalyLineIndex; i++) {
    const embedding = allEmbeddings[i]
    if (!embedding) continue

    const semanticSimilarity = 1 - cosineDistance(anomalyEmbedding, embedding)
    const distanceToAnomaly = anomalyLineIndex - i

    // Recency decay: linear from 1.0 (adjacent) to 0.1 (contextWindowSize away)
    const recencyScore = 1.0 - (0.9 * (distanceToAnomaly - 1)) / contextWindowSize

    const rawText = allLogLines[i]
    const severityBoost = SEVERITY_PATTERN.test(rawText) ? 0.2 : 0.0
    const causalBoost = CAUSAL_PATTERN.test(rawText) ? 0.15 : 0.0

    const relevanceScore =
      0.5 * semanticSimilarity + 0.3 * recencyScore + severityBoost + causalBoost

    candidates.push({
      lineIndex: i,
      text: rawText,
      relevanceScore,
      distanceToAnomaly,
    })
  }

  // Select top-N by relevance score, then re-sort by original line order
  // to preserve temporal causality in the output
  const selected = candidates
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, targetContextLines)
    .sort((a, b) => a.lineIndex - b.lineIndex)

  return {
    anomalyLineIndex,
    contextLines: selected,
    capturedAt: Date.now(),
  }
}
```

### 6.3 Causal Chain Detection

For anomalies with very high scores (>0.55), LogiLog applies an additional causal chain detection step that looks for **correlated anomalies** in the preceding 500 lines — other lines that also scored above threshold but were not individually flagged as high enough to generate a Smart Context. These "precursor anomalies" form the causal chain.

The chain is surfaced to the user as: `[Precursor 1] → [Precursor 2] → [Primary Anomaly]`, giving forensic context for cascading failures (e.g., disk fill → write error → application panic).

---

## 7. Clustering Algorithm

### 7.1 Purpose and Design Constraints

Clustering groups semantically similar log lines into "patterns" so users can collapse repetitive noise (e.g., 50,000 health check lines) into a single row. The algorithm must:

- Run entirely on pre-computed embeddings (no additional inference)
- Complete in under 2 seconds for 10,000 log lines
- Produce human-interpretable cluster counts (5-50 clusters, not 5,000)
- Handle the highly skewed distribution of log lines (one cluster may contain 80% of lines)

### 7.2 Algorithm: Greedy Centroid Clustering (Log-Domain Optimized)

Full DBSCAN or k-means are either too slow (DBSCAN: O(n²) distance computations) or require knowing k in advance (k-means). LogiLog uses a greedy online centroid clustering algorithm that makes a single pass over the embeddings:

```typescript
// inferenceWorker/clustering.ts

export interface LogCluster {
  id: number
  centroid: Float32Array
  memberIndices: number[] // Line indices belonging to this cluster
  representativeText: string // Most central member's raw text
  size: number
}

export interface ClusteringResult {
  clusters: LogCluster[]
  lineClusterMap: Map<number, number> // lineIndex -> clusterId
  totalClusters: number
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.85 // cosine similarity (= 1 - distance)
const MAX_CLUSTERS = 100

/**
 * Single-pass greedy centroid clustering.
 *
 * For each embedding:
 *   1. Find the nearest existing cluster centroid (cosine similarity)
 *   2. If similarity > threshold: assign to that cluster, update centroid
 *   3. If no cluster is close enough: create a new cluster
 *
 * Centroid update: online mean update O(d) per assignment.
 * Total time: O(n * k * d) where n=lines, k=clusters, d=embedding dim.
 * For n=10000, k=50, d=384: ~192M multiply-adds — under 500ms in JS.
 */
export function clusterEmbeddings(
  embeddings: Float32Array[],
  lineIndices: number[],
  logLines: string[],
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): ClusteringResult {
  const clusters: LogCluster[] = []
  const lineClusterMap = new Map<number, number>()

  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i]
    const lineIndex = lineIndices[i]

    let bestClusterId = -1
    let bestSimilarity = -1

    for (const cluster of clusters) {
      const similarity = 1 - cosineDistance(embedding, cluster.centroid)
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestClusterId = cluster.id
      }
    }

    if (bestSimilarity >= similarityThreshold && bestClusterId !== -1) {
      // Assign to existing cluster
      const cluster = clusters[bestClusterId]
      const n = cluster.memberIndices.length

      // Incremental centroid update: new_centroid = (n * old + new) / (n + 1)
      for (let d = 0; d < cluster.centroid.length; d++) {
        cluster.centroid[d] = (cluster.centroid[d] * n + embedding[d]) / (n + 1)
      }

      cluster.memberIndices.push(lineIndex)
      cluster.size++
      lineClusterMap.set(lineIndex, bestClusterId)
    } else if (clusters.length < MAX_CLUSTERS) {
      // Create new cluster
      const newCluster: LogCluster = {
        id: clusters.length,
        centroid: embedding.slice(), // Copy; not a reference
        memberIndices: [lineIndex],
        representativeText: logLines[lineIndex] ?? '',
        size: 1,
      }
      clusters.push(newCluster)
      lineClusterMap.set(lineIndex, newCluster.id)
    } else {
      // Max clusters reached: assign to nearest regardless of threshold
      lineClusterMap.set(lineIndex, bestClusterId)
      const cluster = clusters[bestClusterId]
      cluster.memberIndices.push(lineIndex)
      cluster.size++
    }
  }

  // Update representative text to the member closest to centroid
  for (const cluster of clusters) {
    let minDist = Infinity
    for (const memberIdx of cluster.memberIndices) {
      const memberEmbedding = embeddings[lineIndices.indexOf(memberIdx)]
      if (!memberEmbedding) continue
      const dist = cosineDistance(memberEmbedding, cluster.centroid)
      if (dist < minDist) {
        minDist = dist
        cluster.representativeText = logLines[memberIdx] ?? cluster.representativeText
      }
    }
  }

  return {
    clusters: clusters.sort((a, b) => b.size - a.size), // Largest clusters first
    lineClusterMap,
    totalClusters: clusters.length,
  }
}
```

### 7.3 Similarity Threshold Guidance

The default threshold of 0.85 cosine similarity (0.15 distance) is conservative — it groups only near-identical log patterns. For log files with high linguistic diversity, lower to 0.75. For highly templated logs (e.g., nginx access logs), raise to 0.92 to separate query parameter variations.

### 7.4 Post-Clustering: Anomaly Cluster Identification

After clustering, each cluster receives an `anomalyRate` metric: the fraction of its members that were flagged as anomalous. Clusters with anomalyRate > 0.5 are classified as "anomaly clusters" and highlighted in the UI. This distinguishes between:

- A single anomalous line in an otherwise healthy cluster (isolated incident)
- A cluster that is entirely anomalous (systemic failure pattern)

---

## 8. Performance Optimization

### 8.1 Batching Strategy

**Sequential batch processing with async yield:**

```typescript
async function processWithYield(batches: LogBatch[]): Promise<void> {
  for (const batch of batches) {
    await processBatch(batch)
    // Yield to Worker event loop every batch to process incoming messages
    // (e.g., cancellation requests from UI thread)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}
```

Do not process multiple batches in parallel within a single Worker. The WebGPU device serializes compute commands from a single context — parallel dispatch does not increase throughput and increases memory pressure.

**Batch size tuning table:**

| Device                             | Recommended Batch Size | Rationale                            |
| ---------------------------------- | ---------------------- | ------------------------------------ |
| WebGPU discrete GPU (4GB+ VRAM)    | 32-64                  | Full pipeline utilization            |
| WebGPU integrated GPU (shared RAM) | 16-32                  | Conserve shared memory               |
| WASM fallback                      | 8                      | Avoid blocking event loop >50ms      |
| WASM on mobile                     | 4                      | Mobile CPU has lower SIMD throughput |

### 8.2 WebGPU Memory Management

**GPU buffer lifecycle:**

1. Transformers.js manages ONNX Runtime WebGPU buffers internally. Do not attempt to manually manage these.
2. Between log file analyses, call `embedder.dispose()` if the pipeline will not be used for more than 60 seconds — this releases GPU buffers and reduces memory pressure for other browser tabs.
3. Do not call `dispose()` and recreate the pipeline for each analysis — pipeline initialization (including shader compilation) takes 2-5 seconds.

**Avoiding OOM:**

```typescript
// Before starting inference, estimate GPU memory requirement
function estimateGpuMemoryMb(
  batchSize: number,
  seqLen: number,
  hiddenDim: number,
  numLayers: number = 6,
): number {
  // Activation memory: batch * seq * hidden * num_layers * 4 bytes (fp32)
  const activationsMb = (batchSize * seqLen * hiddenDim * numLayers * 4) / 1024 ** 2
  // Add 20% overhead for attention matrices and intermediate buffers
  return activationsMb * 1.2
}

// For bge-small, batch=32, seq=512, hidden=384, layers=6:
// = (32 * 512 * 384 * 6 * 4) / (1024^2) * 1.2 = ~180MB GPU activations
// At q8, model weights = 67MB; total GPU footprint ≈ 250MB
// Well within 2GB budget but leave room for browser overhead
```

**GPU adapter memory query:**

```typescript
async function checkGpuMemory(): Promise<number | null> {
  if (!navigator.gpu) return null
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) return null

  // adapterInfo.limits.maxBufferSize gives per-buffer limit, not total VRAM
  // There is no standard API to query total VRAM in WebGPU as of 2026
  // Use adapterInfo as a heuristic proxy for device tier
  const adapterInfo = await adapter.requestAdapterInfo()
  return null // Cannot reliably query VRAM; rely on OOM error handling
}

// Catch WebGPU OOM and retry with smaller batch size
async function embedWithOOMRetry(
  embedder: EmbeddingPipeline,
  batch: LogBatch,
): Promise<EmbeddingResult> {
  const MAX_RETRIES = 3
  let batchSize = batch.lines.length

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const subBatch = { ...batch, lines: batch.lines.slice(0, batchSize) }
      return await embedBatch(embedder, subBatch)
    } catch (err) {
      if (err instanceof Error && err.message.includes('out of memory')) {
        batchSize = Math.ceil(batchSize / 2)
        if (batchSize === 0) throw err
        continue
      }
      throw err
    }
  }
  throw new Error('OOM: cannot allocate even with batchSize=1')
}
```

### 8.3 Progressive Inference (Streaming Results)

Results are streamed to the UI thread as each batch completes rather than waiting for full-file processing. This gives users immediate feedback and allows the UI to begin rendering the anomaly timeline before analysis is complete.

The Worker emits `BATCH_COMPLETE` messages with partial results (see Section 9). The UI accumulates these into a live-updating store. For a 100,000-line log file at batch size 32, users see the first anomaly results within approximately 10 seconds of starting analysis.

### 8.4 Cancellation

Long-running inference must be cancellable. The Worker listens for `CANCEL` messages between batch iterations:

```typescript
let cancelled = false

self.addEventListener('message', (e: MessageEvent) => {
  if (e.data.type === 'CANCEL') {
    cancelled = true
  }
})

// In the batch processing loop:
if (cancelled) {
  self.postMessage({ type: 'CANCELLED' })
  return
}
```

---

## 9. Web Worker Architecture

### 9.1 Worker Topology

LogiLog uses two dedicated Workers to separate concerns and avoid contention on a single Worker event loop:

```
┌─────────────────────────┐
│        UI Thread        │
│   (React / Vanilla JS)  │
└────────────┬────────────┘
             │ postMessage / onmessage
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌──────────┐    ┌──────────────┐
│  Parser  │    │  Inference   │
│  Worker  │    │    Worker    │
│          │    │              │
│  File    │    │ Transformers │
│  System  │    │     .js      │
│  Access  │    │   + ONNX RT  │
│  API     │    │  + WebGPU    │
└──────────┘    └──────────────┘
```

The Parser Worker handles file reading (via File System Access API), log line tokenization (timestamp extraction, severity parsing), and feeds preprocessed data to the Inference Worker. The Inference Worker owns the model pipeline and all ML computation.

### 9.2 TypeScript Message Protocol

```typescript
// types/workerMessages.ts

// ─── Messages: UI → Inference Worker ───────────────────────────────────────

export interface InitModelMessage {
  type: 'INIT_MODEL'
  modelId: string // e.g. 'Xenova/bge-small-en-v1.5'
  dtype: 'q4' | 'q8' | 'q4f16'
  device: 'webgpu' | 'wasm'
  forceRedownload?: boolean
}

export interface AnalyzeLogsMessage {
  type: 'ANALYZE_LOGS'
  analysisId: string // UUID for this analysis session
  logLines: string[] // Raw log lines
  logTimestampsMs: number[] // Parsed timestamps (0 if unknown)
  options?: AnalysisOptions
}

export interface AnalysisOptions {
  windowSize?: number // Baseline rolling window (default 200)
  batchSize?: number // Override default batch size
  contextWindowSize?: number // Smart context lookback (default 200)
  targetContextLines?: number // Context lines to capture (default 75)
  similarityThreshold?: number // Clustering threshold (default 0.85)
}

export interface CancelMessage {
  type: 'CANCEL'
  analysisId: string
}

export interface ClearCacheMessage {
  type: 'CLEAR_CACHE'
  modelId?: string // If omitted, clears all cached models
}

// ─── Messages: Inference Worker → UI ───────────────────────────────────────

export interface ModelLoadProgressMessage {
  type: 'MODEL_LOAD_PROGRESS'
  stage: LoadStage
  progress?: number // 0.0 to 1.0 during 'downloading'
  errorMessage?: string // Set when stage = 'error'
}

export interface ModelReadyMessage {
  type: 'MODEL_READY'
  modelId: string
  dtype: string
  device: string
  loadTimeMs: number
  fromCache: boolean
}

export interface BatchCompleteMessage {
  type: 'BATCH_COMPLETE'
  analysisId: string
  batchId: number
  processedLines: number
  totalLines: number
  anomalies: AnomalyScore[] // Anomalies detected in this batch
  inferenceMs: number
}

export interface SmartContextReadyMessage {
  type: 'SMART_CONTEXT_READY'
  analysisId: string
  anomalyLineIndex: number
  context: SmartContext
}

export interface AnalysisCompleteMessage {
  type: 'ANALYSIS_COMPLETE'
  analysisId: string
  totalLines: number
  totalAnomalies: number
  clusters: LogCluster[]
  lineClusterMap: [number, number][] // Serialized Map entries
  totalTimeMs: number
  allScores: AnomalyScore[] // Full score array for timeline rendering
}

export interface ErrorMessage {
  type: 'ERROR'
  analysisId?: string
  errorCode: InferenceErrorCode
  message: string
  recoverable: boolean
}

export type InferenceErrorCode =
  | 'MODEL_LOAD_FAILED'
  | 'WEBGPU_NOT_SUPPORTED'
  | 'OOM'
  | 'INFERENCE_FAILED'
  | 'CACHE_WRITE_FAILED'
  | 'CANCELLED'

// ─── Union types for exhaustive message handling ────────────────────────────

export type UIToWorkerMessage =
  | InitModelMessage
  | AnalyzeLogsMessage
  | CancelMessage
  | ClearCacheMessage

export type WorkerToUIMessage =
  | ModelLoadProgressMessage
  | ModelReadyMessage
  | BatchCompleteMessage
  | SmartContextReadyMessage
  | AnalysisCompleteMessage
  | ErrorMessage
```

### 9.3 Transferable Objects

Use `Transferable` objects (specifically `ArrayBuffer`) when sending large embedding arrays from Worker to UI to avoid the overhead of structured clone copying. However, in practice the UI thread does not need raw embeddings — only anomaly scores and cluster metadata. Structured clone for these small objects is acceptable.

For the `allScores` array in `AnalysisCompleteMessage` on very large log files (100k+ lines), consider using a `SharedArrayBuffer` approach — write scores into a SAB in the Worker and pass only the SAB reference (zero-copy) to the UI. This requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers, which LogiLog already requires per the seed document.

### 9.4 Worker Initialization Pattern

```typescript
// inferenceWorker/main.ts

import { IDBModelCache } from './idbCache'
import { runAnomalyScoring } from './anomalyScorer'
import { clusterEmbeddings } from './clustering'

let embedder: EmbeddingPipeline | null = null
let allEmbeddings: Map<number, Float32Array> = new Map()

self.addEventListener('message', async (e: MessageEvent<UIToWorkerMessage>) => {
  const msg = e.data

  switch (msg.type) {
    case 'INIT_MODEL':
      await handleInitModel(msg)
      break
    case 'ANALYZE_LOGS':
      await handleAnalyzeLogs(msg)
      break
    case 'CANCEL':
      cancelled = true
      break
    case 'CLEAR_CACHE':
      await handleClearCache(msg)
      break
  }
})

function postToUI(message: WorkerToUIMessage): void {
  self.postMessage(message)
}
```

---

## 10. Fallback Strategy

### 10.1 WebGPU Detection

```typescript
// inferenceWorker/capabilities.ts

export interface DeviceCapabilities {
  hasWebGPU: boolean
  hasWebGL: boolean
  estimatedMemoryGb: number | null
  recommendedDevice: 'webgpu' | 'wasm'
  recommendedModel: string
  recommendedDtype: 'q4' | 'q8' | 'q4f16'
}

export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const hasWebGPU =
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    (await navigator.gpu?.requestAdapter()) !== null

  const hasWebGL = (() => {
    try {
      const canvas = new OffscreenCanvas(1, 1)
      return canvas.getContext('webgl2') !== null
    } catch {
      return false
    }
  })()

  // Heuristic memory estimation (no standard API)
  let estimatedMemoryGb: number | null = null
  if ('memory' in performance) {
    const mem = (performance as any).memory
    estimatedMemoryGb = mem.jsHeapSizeLimit / 1024 ** 3
  }

  const isConstrained = estimatedMemoryGb !== null && estimatedMemoryGb < 1.5

  if (hasWebGPU && !isConstrained) {
    return {
      hasWebGPU: true,
      hasWebGL,
      estimatedMemoryGb,
      recommendedDevice: 'webgpu',
      recommendedModel: 'Xenova/bge-small-en-v1.5',
      recommendedDtype: 'q8',
    }
  } else if (hasWebGPU && isConstrained) {
    return {
      hasWebGPU: true,
      hasWebGL,
      estimatedMemoryGb,
      recommendedDevice: 'webgpu',
      recommendedModel: 'Xenova/bge-small-en-v1.5',
      recommendedDtype: 'q4',
    }
  } else {
    return {
      hasWebGPU: false,
      hasWebGL,
      estimatedMemoryGb,
      recommendedDevice: 'wasm',
      recommendedModel: 'Xenova/all-MiniLM-L6-v2',
      recommendedDtype: 'q4',
    }
  }
}
```

### 10.2 WASM Fallback Configuration

When WebGPU is unavailable (Firefox < 113 without flag, Safari < 17.4, corporate Chrome with GPU blocklist), Transformers.js falls back to ONNX Runtime WebAssembly:

```typescript
// WASM fallback initialization
const embedder = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2', // Smaller model for WASM path
  {
    device: 'wasm',
    dtype: 'q4',
    // WASM-specific: enable SIMD and threading for best performance
    // These are controlled via env before pipeline creation
  },
)

// Set before pipeline():
env.backends.onnx.wasm.simd = true // SIMD WASM (widely supported)
env.backends.onnx.wasm.proxy = false // Direct WASM execution
env.backends.onnx.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 4, 4) // Cap at 4 threads; more threads don't help for batch embedding
```

### 10.3 Performance Expectations by Backend

| Backend                          | Model        | Batch Size | Throughput (lines/sec) | Anomaly Score for 10k lines |
| -------------------------------- | ------------ | ---------- | ---------------------- | --------------------------- |
| WebGPU (discrete GPU)            | bge-small q8 | 32         | ~3,000                 | ~3.5 seconds                |
| WebGPU (integrated GPU)          | bge-small q8 | 16         | ~1,500                 | ~7 seconds                  |
| WebGPU (integrated, constrained) | bge-small q4 | 16         | ~2,000                 | ~5 seconds                  |
| WASM (4-thread SIMD)             | MiniLM-L6 q4 | 8          | ~150                   | ~67 seconds                 |
| WASM (single-thread)             | MiniLM-L6 q4 | 4          | ~50                    | ~200 seconds                |

**UX implication:** For the WASM path, the 5-second responsiveness requirement from the seed document applies only to showing progress — not completing analysis. The UI must show a progress bar and estimated completion time on the WASM path. Analysis of files larger than 5,000 lines on WASM single-thread should prompt the user with an explicit warning that processing will take several minutes.

### 10.4 WASM Memory Considerations

WASM heap size is configurable at compile time but LogiLog uses the Transformers.js pre-built WASM binary, which defaults to a 4GB virtual address space heap (not all physically allocated). Physical memory usage is dominated by model weights (~23MB for MiniLM q4) and activation buffers (~20MB at batch size 8). Total WASM footprint: approximately 80MB, compatible with all platforms that support WASM.

---

## 11. Evaluation Metrics

### 11.1 Synthetic Dataset Construction

Since LogiLog is a privacy-first tool with no access to user log data, evaluation uses synthetic log datasets constructed from templates. The test harness is a separate Node.js script, not shipped in the browser bundle.

**Dataset types:**

1. **Clean baseline:** 10,000 lines of repetitive healthy operational logs (health checks, metrics, DB queries, HTTP 200s) with zero ground-truth anomalies.

2. **Single-anomaly injection:** Clean baseline with 1 injected anomaly at position N (varied across quartiles). Used to measure detection sensitivity.

3. **Clustered anomaly sequence:** 5-10 consecutive anomalous lines (simulating a cascading failure). Used to measure the Smart Context algorithm.

4. **High-noise environment:** 30% of lines are "unusual but not anomalous" (e.g., rare but healthy cron job logs). Used to measure false positive rate.

5. **Volume spike:** 2,000-line burst of routine logs in a short time window. Used to verify volume vs. semantic anomaly separation.

### 11.2 Primary Metrics

**Anomaly Detection Quality:**

```
Precision = True Positives / (True Positives + False Positives)
Recall    = True Positives / (True Positives + False Negatives)
F1        = 2 * (Precision * Recall) / (Precision + Recall)
```

**Target thresholds:**

| Metric    | Minimum Acceptable | Target |
| --------- | ------------------ | ------ |
| Precision | 0.70               | 0.85   |
| Recall    | 0.80               | 0.92   |
| F1        | 0.75               | 0.88   |

**Smart Context Quality:**

- **Context Recall:** What fraction of the ground-truth causal lines (manually labeled) appear in the Smart Context output?
- **Context Precision:** What fraction of the Smart Context output lines are actually causal?
- Target: Context Recall >= 0.75, Context Precision >= 0.60.

**Clustering Quality:**

- **Silhouette Score:** Mean over all points of `(b - a) / max(a, b)` where `a` = intra-cluster distance, `b` = nearest inter-cluster distance. Target >= 0.55.
- **Cluster Purity:** For labeled datasets, fraction of each cluster belonging to a single true category. Target >= 0.80.

### 11.3 Performance Benchmarks

Measure and track these benchmarks for every model/quantization change:

| Benchmark                               | Target      | Measurement Method                                         |
| --------------------------------------- | ----------- | ---------------------------------------------------------- |
| Model cold load (WebGPU)                | <35 seconds | Wall clock from `INIT_MODEL` to `MODEL_READY` on fresh IDB |
| Model warm load (from IDB)              | <3 seconds  | Wall clock on cached model                                 |
| 1,000 lines analysis (WebGPU q8)        | <2 seconds  | Wall clock `ANALYZE_LOGS` to `ANALYSIS_COMPLETE`           |
| 10,000 lines analysis (WebGPU q8)       | <20 seconds | Wall clock                                                 |
| Peak Worker memory                      | <350MB      | `performance.memory` in Worker                             |
| GPU VRAM (estimated from OOM threshold) | <400MB      | Binary search batch size until OOM                         |

### 11.4 Regression Testing

Maintain a benchmark suite as part of the repository. Run on CI (Node.js + ONNX Runtime Node.js backend, which is API-compatible with Transformers.js) to catch regressions:

```
npm run benchmark:anomaly-detection
npm run benchmark:clustering
npm run benchmark:inference-speed
```

These use the same preprocessing and scoring code as the browser bundle, validating correctness without requiring a browser environment.

---

## 12. Model Update Strategy

### 12.1 Versioning Scheme

Each cached model is tagged with a compound cache key (see Section 3.2). New model versions arrive via two paths:

1. **HuggingFace revision update:** The upstream ONNX model on HuggingFace Hub is updated. LogiLog pins to a specific Git commit SHA (revision) in the model ID, not `main`. Updating to a new revision is an explicit act controlled by a LogiLog application version bump.

2. **LogiLog application update:** When LogiLog itself ships a new version that references a different model or quantization tier, the cache key changes automatically, triggering a fresh download.

### 12.2 Migration Without Cache Loss

When a new model version is deployed, the old model's IndexedDB entry is preserved until:

1. The new model has been successfully downloaded and verified (SHA-256 match).
2. The new model has passed a warm-up inference round.
3. Only then is the old model entry deleted from IndexedDB.

This prevents a user from losing their cached model due to a failed download of a new version.

```typescript
// inferenceWorker/modelMigration.ts

export async function migrateModelCache(
  cache: IDBModelCache,
  oldKey: string,
  newKey: string,
  downloadAndVerify: () => Promise<boolean>,
): Promise<'migrated' | 'failed' | 'no-change'> {
  if (oldKey === newKey) return 'no-change'

  const hasNew = await cache.has(newKey)
  if (hasNew) {
    // Already on new version; safe to delete old
    // (but don't block inference on cleanup)
    setTimeout(() => cache.delete?.(oldKey), 5000)
    return 'migrated'
  }

  const success = await downloadAndVerify()
  if (success) {
    setTimeout(() => cache.delete?.(oldKey), 5000)
    return 'migrated'
  }

  // Download failed; retain old model and report failure
  return 'failed'
}
```

### 12.3 Storage Quota Management

IndexedDB storage is subject to browser quotas (typically 60% of available disk space, with per-origin limits). LogiLog checks available quota before storing:

```typescript
async function checkStorageQuota(requiredBytes: number): Promise<boolean> {
  if (!navigator.storage?.estimate) return true // Assume OK if API unavailable

  const { quota, usage } = await navigator.storage.estimate()
  if (!quota || !usage) return true

  const available = quota - usage
  // Require 2x the model size as buffer (download staging + storage)
  return available >= requiredBytes * 2
}
```

If quota is insufficient, LogiLog offers the user a "Clear old model cache" action before downloading a new model.

### 12.4 User Communication

Model updates are non-silent. When LogiLog detects a new model version is available (determined by comparing the current `transformersJsVersion` + model revision against the pinned versions in `package.json`), it displays a non-blocking notification:

```
"A better anomaly detection model is available (bge-small v2, +12% recall).
 Download now? (67MB) — or continue with cached model."
```

Users retain full control over when to incur the download cost. The current cached model continues to function until the user initiates the upgrade.

### 12.5 Future Model Expansion

The architecture supports adding additional model tiers without structural changes:

- **Domain-adapted model:** If a fine-tuned log-domain embedding model becomes available on HuggingFace Hub in ONNX format (e.g., fine-tuned BGE on log datasets), it can be swapped in by changing the model ID and revision in the configuration. The pipeline, anomaly scoring, clustering, and Smart Context algorithms are all model-agnostic.

- **Larger model tier:** A `bge-base-en-v1.5` (768-dim, 219MB q8) tier could be offered for power users with high-VRAM discrete GPUs. The `AdaptiveThreshold` and clustering algorithms would require threshold recalibration at the new embedding dimension but no structural changes.

- **On-device fine-tuning:** Out of scope for v1. ONNX Runtime does not support training in the browser. Any fine-tuning would need to occur server-side (with user consent) and produce a new quantized ONNX model for redistribution.

---

## Appendix A: Dependency Versions

| Package                     | Version   | Notes                                                          |
| --------------------------- | --------- | -------------------------------------------------------------- |
| `@huggingface/transformers` | `^3.1.0`  | Primary inference library (formerly `@xenova/transformers`)    |
| `onnxruntime-web`           | `^1.19.0` | Peer dep of Transformers.js; provides WASM and WebGPU backends |

Pin these versions in `package.json`. Transformers.js v3 made breaking changes to the model loading API vs. v2; do not accept automatic minor bumps without testing.

## Appendix B: CORS and Security Headers Required

The following HTTP response headers are required for WebGPU + SharedArrayBuffer to function (already mandated by the seed document for GitHub Pages deployment):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Additionally, the Content Security Policy must permit fetching from `huggingface.co` for initial model downloads:

```
Content-Security-Policy: default-src 'self';
  connect-src 'self' https://huggingface.co https://cdn-lfs.huggingface.co;
  worker-src 'self' blob:;
  script-src 'self' 'wasm-unsafe-eval';
```

The `wasm-unsafe-eval` source expression is required by ONNX Runtime Web for WASM JIT compilation.

## Appendix C: Embedding Dimension Reference

| Model                      | Dim | Notes                  |
| -------------------------- | --- | ---------------------- |
| `Xenova/all-MiniLM-L6-v2`  | 384 | Default fallback       |
| `Xenova/bge-small-en-v1.5` | 384 | Primary model          |
| `Xenova/all-MiniLM-L12-v2` | 384 | Slower, same dim       |
| `Xenova/bge-base-en-v1.5`  | 768 | Future power-user tier |

All primary and fallback models use 384 dimensions. This means cosine distance arrays, baseline centroid storage, and cluster centroid storage are all sized identically for the default configuration, simplifying memory allocation arithmetic.
