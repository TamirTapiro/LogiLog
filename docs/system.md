# LogiLog: System Architecture Document

> Version 1.0 | March 2026
> Status: Approved for implementation

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technical Stack Decisions](#2-technical-stack-decisions)
3. [Module Architecture](#3-module-architecture)
4. [Data Flow](#4-data-flow)
5. [Web Worker Architecture](#5-web-worker-architecture)
6. [State Management](#6-state-management)
7. [Performance Targets](#7-performance-targets)
8. [Security & Privacy Model](#8-security--privacy-model)
9. [Browser Compatibility Matrix](#9-browser-compatibility-matrix)
10. [Monorepo vs Single App](#10-monorepo-vs-single-app)
11. [Build System](#11-build-system)
12. [Open Questions / Risks](#12-open-questions--risks)

---

## 1. System Overview

LogiLog is a browser-native, zero-backend forensic log analysis engine. All computation
-- file parsing, ML inference, anomaly scoring, clustering -- executes entirely within the
user's browser. No log data ever leaves the machine.

### 1.1 High-Level Architecture

```
+------------------------------------------------------------------+
|                        BROWSER TAB                                |
|                                                                   |
|  +------------------+    +-------------------+                    |
|  |   UI Thread      |    |   Storage Layer   |                    |
|  |                  |    |                   |                    |
|  |  React 19 App    |    |  IndexedDB        |                    |
|  |  Zustand Store   |<-->|  - parsed logs    |                    |
|  |  Timeline View   |    |  - embeddings     |                    |
|  |  Cluster View    |    |  - model weights  |                    |
|  |  Anomaly Report  |    |  (via OPFS for    |                    |
|  |                  |    |   ONNX cache)     |                    |
|  +--------+---------+    +--------+----------+                    |
|           |                       |                               |
|           | postMessage           | IDB transactions              |
|           | (Comlink RPC)         |                               |
|           v                       v                               |
|  +------------------------------------------------+              |
|  |              Worker Pool                        |              |
|  |                                                 |              |
|  |  +------------------+  +---------------------+  |              |
|  |  | Ingestion Worker |  | Inference Worker    |  |              |
|  |  |                  |  |                     |  |              |
|  |  | - File streaming |  | - Transformers.js  |  |              |
|  |  | - Line parsing   |  | - WebGPU / WASM    |  |              |
|  |  | - Structured     |  | - Embedding gen    |  |              |
|  |  |   extraction     |  | - Batch inference  |  |              |
|  |  +------------------+  +---------------------+  |              |
|  |                                                 |              |
|  |  +------------------+  +---------------------+  |              |
|  |  | Analysis Worker  |  | Context Worker      |  |              |
|  |  |                  |  |                     |  |              |
|  |  | - Cosine dist    |  | - Smart Context    |  |              |
|  |  | - Anomaly score  |  |   extraction       |  |              |
|  |  | - Clustering     |  | - Narrative gen    |  |              |
|  |  | - Pattern detect |  | - Export assembly  |  |              |
|  |  +------------------+  +---------------------+  |              |
|  +------------------------------------------------+              |
|                                                                   |
+------------------------------------------------------------------+
|                     STATIC HOST (GitHub Pages)                    |
|                   COOP + COEP headers via _headers                |
+------------------------------------------------------------------+
```

### 1.2 Component Summary

| Component        | Responsibility                                    | Thread     |
| ---------------- | ------------------------------------------------- | ---------- |
| React UI         | Rendering, user interaction, state subscriptions  | Main       |
| Zustand Store    | Centralized UI state, progress tracking           | Main       |
| Ingestion Worker | File reading, line parsing, structured extraction | Worker 1   |
| Inference Worker | Model loading, embedding generation, GPU dispatch | Worker 2   |
| Analysis Worker  | Distance computation, anomaly scoring, clustering | Worker 3   |
| Context Worker   | Smart Context extraction, narrative assembly      | Worker 4   |
| Storage Layer    | IndexedDB reads/writes, model cache via OPFS      | Any thread |

---

## 2. Technical Stack Decisions

### 2.1 Core Dependencies

| Package                     | Version   | Purpose                                       | Justification                                                                                                    |
| --------------------------- | --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `react`                     | `^19.0.0` | UI framework                                  | Concurrent rendering, Suspense for async model loading, largest ecosystem                                        |
| `react-dom`                 | `^19.0.0` | DOM rendering                                 | Paired with React 19                                                                                             |
| `@huggingface/transformers` | `^3.8.1`  | ML inference in browser                       | Only production-ready library for running ONNX models with WebGPU backend in browser; 100x faster than WASM      |
| `onnxruntime-web`           | `^1.24.3` | ONNX Runtime (transitive via Transformers.js) | WebGPU execution provider, Flash Attention, quantized model support                                              |
| `zustand`                   | `^5.0.11` | Client state management                       | Minimal API (no providers), works outside React (workers can read), subscriptions with selectors avoid rerenders |
| `idb`                       | `^8.0.3`  | IndexedDB Promise wrapper                     | 1.19kB brotli'd, mirrors native API, async/await, used by 1200+ packages                                         |
| `comlink`                   | `^4.4.2`  | Worker RPC abstraction                        | 1.1kB, ES6 Proxy-based, eliminates manual postMessage/onmessage boilerplate                                      |
| `recharts`                  | `^2.15.0` | Timeline and chart visualization              | React-native charting, composable, responsive, handles large datasets with virtualization                        |
| `react-window`              | `^1.8.11` | Virtualized list rendering                    | Log lines can reach millions; DOM virtualization is non-negotiable                                               |
| `browser-fs-access`         | `^0.35.0` | File System Access API polyfill               | Graceful fallback from File System Access API to `<input type="file">` for Firefox/Safari                        |
| `fflate`                    | `^0.8.2`  | Streaming decompression                       | Handles `.gz` and `.zip` log archives; pure JS, no WASM dependency, 8kB                                          |

### 2.2 Dev Dependencies

| Package                       | Version  | Purpose                                               |
| ----------------------------- | -------- | ----------------------------------------------------- |
| `vite`                        | `^6.2.0` | Build tool, dev server, worker bundling via `?worker` |
| `typescript`                  | `^5.7.0` | Type safety                                           |
| `vitest`                      | `^3.0.0` | Testing (Vite-native, no config duplication)          |
| `@vitest/web-worker`          | `^3.0.0` | Worker testing in Vitest                              |
| `vite-plugin-top-level-await` | `^1.4.0` | Enables top-level `await` for WebGPU init in workers  |
| `vite-plugin-wasm`            | `^3.4.0` | WASM file handling for ONNX Runtime fallback          |
| `tailwindcss`                 | `^4.0.0` | Utility-first CSS, terminal aesthetic theming         |
| `eslint`                      | `^9.0.0` | Linting with flat config                              |
| `prettier`                    | `^3.5.0` | Formatting                                            |

### 2.3 Models

| Model                               | Task            | Dims | Size (q4) | Rationale                                                                         |
| ----------------------------------- | --------------- | ---- | --------- | --------------------------------------------------------------------------------- |
| `Xenova/all-MiniLM-L6-v2`           | Embedding       | 384  | ~23 MB    | Battle-tested for semantic similarity, tiny footprint, fast inference, ONNX-ready |
| `Xenova/bge-small-en-v1.5`          | Embedding (alt) | 384  | ~33 MB    | Higher quality embeddings, slightly larger; offered as user-selectable upgrade    |
| `google/embeddinggemma-e2` (future) | Embedding       | 768  | ~150 MB   | Next-gen option; multilingual, higher quality; gate behind "advanced" setting     |

The default model is `all-MiniLM-L6-v2` because it fits comfortably in browser memory, loads
in under 3 seconds from cache, and produces embeddings fast enough for real-time analysis.

---

## 3. Module Architecture

### 3.1 Log Ingestion Module

**Location:** `src/workers/ingestion.worker.ts`

**Responsibility:** Read log files from disk via the File System Access API (or `<input>`
fallback), stream them in chunks, parse each line into a structured `LogEntry`, and emit
parsed batches to the main thread.

**Key Design Decisions:**

1. **Streaming, not loading.** Files are read via `ReadableStream` in 1 MB chunks using
   `file.stream()`. This handles multi-GB log files without exceeding browser memory limits.

2. **Incremental line splitting.** A `TextDecoderStream` decodes UTF-8 on-the-fly. A custom
   `TransformStream` accumulates partial lines across chunk boundaries.

3. **Structured extraction.** Each raw line is parsed against a configurable set of regex
   patterns (syslog, JSON, Apache Combined, nginx, k8s) to extract:
   - `timestamp` (normalized to epoch ms)
   - `level` (ERROR, WARN, INFO, DEBUG, TRACE)
   - `source` (service name, pod ID, filename)
   - `message` (the remaining free text)

4. **Batch emission.** Parsed lines are emitted in batches of 500 to amortize postMessage
   overhead. Batches use `Transferable` `ArrayBuffer` backing for the string data.

```typescript
// src/types/log.ts

export interface LogEntry {
  /** Monotonic index within the ingested file */
  id: number
  /** Unix epoch milliseconds */
  timestamp: number
  /** Normalized severity level */
  level: LogLevel
  /** Source identifier (service, pod, filename) */
  source: string
  /** Raw log message text (after timestamp/level stripping) */
  message: string
  /** Original raw line (kept for forensic display) */
  raw: string
  /** Byte offset in source file (enables seeking) */
  byteOffset: number
}

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN'

export interface ParsedBatch {
  entries: LogEntry[]
  /** Total lines parsed so far (for progress reporting) */
  totalParsed: number
  /** Whether this is the final batch */
  done: boolean
}
```

**Parser Registry Pattern:**

```typescript
// src/workers/parsers/registry.ts

export interface LogParser {
  name: string
  /** Returns true if this parser can handle the given sample lines */
  detect(sampleLines: string[]): boolean
  /** Parse a single raw line into a LogEntry (minus id and byteOffset) */
  parse(line: string): Omit<LogEntry, 'id' | 'byteOffset'> | null
}

// Auto-detection: the first 20 lines are run through all parsers.
// The parser with the highest detect() score wins and is used for the rest of the file.
```

Built-in parsers: `SyslogParser`, `JsonParser`, `ApacheCombinedParser`, `NginxParser`,
`K8sParser`, `GenericTimestampParser` (fallback).

---

### 3.2 Inference Engine Module

**Location:** `src/workers/inference.worker.ts`

**Responsibility:** Load the ONNX embedding model via Transformers.js, manage GPU/WASM
device selection, generate embeddings for log entry messages, and cache the model weights.

**Key Design Decisions:**

1. **Device negotiation.** On worker init, probe for WebGPU via `navigator.gpu`. If
   available, use `device: 'webgpu'`. Otherwise, fall back to `device: 'wasm'` (CPU). Report
   the selected device to the main thread so the UI can display it.

2. **Model lifecycle.** The model is loaded once per session. Transformers.js internally
   caches weights in the Origin Private File System (OPFS) via ONNX Runtime's caching layer.
   First load: ~5-30s depending on network. Subsequent loads from cache: <3s.

3. **Batch inference.** Embeddings are generated in micro-batches of 32 log messages.
   Larger batches risk GPU OOM on low-end devices. The batch size is configurable.

4. **Embedding normalization.** All output vectors are L2-normalized before storage so
   cosine similarity reduces to a dot product.

```typescript
// src/workers/inference.worker.ts (core interface)

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import * as Comlink from 'comlink'

export interface InferenceEngine {
  /** Initialize the model pipeline. Returns device used ('webgpu' | 'wasm'). */
  init(modelId?: string): Promise<'webgpu' | 'wasm'>

  /** Generate L2-normalized embeddings for a batch of texts. */
  embed(texts: string[]): Promise<Float32Array>

  /** Report model loading progress (0-100). Callback via Comlink proxy. */
  onProgress: (callback: (progress: number) => void) => void

  /** Tear down the pipeline and free GPU resources. */
  dispose(): Promise<void>
}

// Implementation sketch:
let extractor: FeatureExtractionPipeline | null = null

async function init(modelId = 'Xenova/all-MiniLM-L6-v2'): Promise<'webgpu' | 'wasm'> {
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator
  const device = hasWebGPU ? 'webgpu' : 'wasm'

  extractor = await pipeline('feature-extraction', modelId, {
    device,
    dtype: 'q4', // 4-bit quantization
    progress_callback: (p: { progress: number }) => {
      // Forward to main thread via Comlink proxy
    },
  })

  return device
}

async function embed(texts: string[]): Promise<Float32Array> {
  if (!extractor) throw new Error('Model not initialized')

  const output = await extractor(texts, {
    pooling: 'mean',
    normalize: true,
  })

  // output.data is already a Float32Array
  return Comlink.transfer(output.data as Float32Array, [(output.data as Float32Array).buffer])
}
```

---

### 3.3 Semantic Analysis Module

**Location:** `src/workers/analysis.worker.ts`

**Responsibility:** Compute cosine distances between embedding vectors, calculate anomaly
scores, cluster similar log entries, and rank anomalies by severity.

**Key Design Decisions:**

1. **Sliding window cosine distance.** For each log entry embedding `e[i]`, compute its
   mean cosine distance against the previous `W` entries (default `W = 50`). This produces
   a per-entry anomaly score in `[0, 2]` (0 = identical, 2 = diametrically opposed).

2. **Adaptive threshold.** Rather than a fixed cutoff, the anomaly threshold is set to
   `mean(scores) + k * stddev(scores)` where `k` defaults to 2.0 (user-adjustable).
   This adapts to the baseline noise level of each log file.

3. **Clustering via greedy leader.** Entries are clustered by cosine similarity using a
   greedy leader algorithm (O(n\*k) where k = number of clusters). An entry joins the
   nearest existing cluster if similarity > 0.85; otherwise, it spawns a new cluster.
   This is chosen over k-means or DBSCAN because it is single-pass, streaming-friendly,
   and requires no hyperparameter tuning.

4. **Pure computation, no dependencies.** This worker performs only SIMD-friendly math on
   `Float32Array` data. No ML library needed.

```typescript
// src/types/analysis.ts

export interface AnomalyResult {
  /** Index of the log entry */
  entryId: number
  /** Cosine distance from sliding window mean (0-2 scale) */
  distanceScore: number
  /** Whether this exceeds the adaptive threshold */
  isAnomaly: boolean
  /** Rank among all anomalies (1 = most anomalous) */
  rank: number
}

export interface LogCluster {
  /** Stable cluster identifier */
  id: string
  /** Centroid embedding vector */
  centroid: Float32Array
  /** Representative log message (closest to centroid) */
  representative: string
  /** IDs of log entries in this cluster */
  memberIds: number[]
  /** Total count */
  count: number
}

export interface AnalysisConfig {
  /** Sliding window size for distance computation */
  windowSize: number // default: 50
  /** Anomaly threshold multiplier (k * stddev above mean) */
  thresholdK: number // default: 2.0
  /** Clustering similarity threshold */
  clusterThreshold: number // default: 0.85
}

// --- Core functions ---

/**
 * Cosine similarity between two L2-normalized vectors.
 * Since vectors are pre-normalized, this is a pure dot product.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
  }
  return dot
}

/**
 * Cosine distance = 1 - similarity.
 */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  return 1 - cosineSimilarity(a, b)
}
```

---

### 3.4 Smart Context Module

**Location:** `src/workers/context.worker.ts`

**Responsibility:** When an anomaly is detected, extract the surrounding forensic context
(50-100 preceding lines), identify the causal chain, and produce a human-readable narrative.

**Key Design Decisions:**

1. **Context window.** For each anomaly, capture lines `[i - contextBefore, i + contextAfter]`
   where `contextBefore = 75` and `contextAfter = 25` by default. The window is bounded to
   the file's actual line range.

2. **Causal chain extraction.** Within the context window, identify the sequence of
   escalating severity levels (INFO -> WARN -> ERROR -> FATAL). Extract the earliest
   non-INFO entry as the probable "trigger point."

3. **Pattern annotation.** Flag known forensic patterns within the context:
   - Stack traces (multi-line indented blocks starting with `at` or `Caused by`)
   - Repeated error bursts (same message N times in M seconds)
   - Timeout sequences (increasing latency values)
   - Connection refused / DNS resolution failures

4. **No LLM summarization in v1.** The "plain English" narrative is template-based, not
   LLM-generated. This avoids loading a second (generative) model and keeps memory usage
   within budget. LLM summarization is deferred to v2.

```typescript
// src/types/context.ts

export interface SmartContext {
  /** The anomaly this context explains */
  anomalyEntryId: number
  /** The full context window of log entries */
  windowEntries: LogEntry[]
  /** Index within windowEntries of the anomalous line */
  anomalyIndexInWindow: number
  /** Identified trigger point (earliest non-INFO line) */
  triggerEntry: LogEntry | null
  /** Detected forensic patterns */
  patterns: ForensicPattern[]
  /** Template-generated narrative */
  narrative: string
}

export interface ForensicPattern {
  type: 'stack_trace' | 'error_burst' | 'timeout_escalation' | 'connection_failure' | 'oom'
  /** Line range within the context window */
  startIndex: number
  endIndex: number
  /** Human-readable description */
  description: string
}
```

---

### 3.5 Storage Module

**Location:** `src/storage/`

**Responsibility:** Persist parsed log entries, embedding vectors, analysis results, model
cache metadata, and user settings in IndexedDB.

**Key Design Decisions:**

1. **IndexedDB over localStorage.** IndexedDB supports structured data, binary blobs
   (Float32Array embeddings), and has a much higher storage quota (~2 GB+ vs 5 MB).

2. **Model weights cached via OPFS.** Transformers.js / ONNX Runtime Web uses the Origin
   Private File System for model caching. LogiLog does not manage this directly; it
   delegates to the library's built-in caching.

3. **Session-scoped data.** Each file analysis creates a new "session" in IndexedDB. Users
   can revisit past sessions. Sessions older than 30 days are auto-pruned.

4. **Chunked embedding storage.** Embedding vectors are stored in chunks of 1000 entries
   as a single `Float32Array` blob to minimize IDB transaction overhead.

```typescript
// src/storage/schema.ts

import { type DBSchema } from 'idb'

export interface LogiLogDB extends DBSchema {
  /**
   * Analysis sessions (one per file analyzed).
   */
  sessions: {
    key: string // UUID
    value: {
      id: string
      fileName: string
      fileSize: number
      lineCount: number
      createdAt: number // epoch ms
      status: 'ingesting' | 'embedding' | 'analyzing' | 'complete' | 'error'
      modelId: string
      deviceUsed: 'webgpu' | 'wasm'
      analysisConfig: AnalysisConfig
    }
    indexes: {
      'by-created': number
    }
  }

  /**
   * Parsed log entries, keyed by [sessionId, entryId].
   */
  logEntries: {
    key: [string, number] // [sessionId, entryId]
    value: LogEntry & {
      sessionId: string
    }
    indexes: {
      'by-session': string
      'by-session-timestamp': [string, number]
      'by-session-level': [string, LogLevel]
    }
  }

  /**
   * Embedding vectors stored in chunks for performance.
   * Each record holds embeddings for up to 1000 log entries.
   */
  embeddingChunks: {
    key: [string, number] // [sessionId, chunkIndex]
    value: {
      sessionId: string
      chunkIndex: number
      /** startEntryId = chunkIndex * 1000 */
      startEntryId: number
      /** Number of embeddings in this chunk (<=1000) */
      count: number
      /** Flat Float32Array: count * embeddingDim floats */
      vectors: Float32Array
      /** Embedding dimensionality (e.g. 384) */
      dim: number
    }
    indexes: {
      'by-session': string
    }
  }

  /**
   * Anomaly results for a session.
   */
  anomalies: {
    key: [string, number] // [sessionId, entryId]
    value: AnomalyResult & {
      sessionId: string
    }
    indexes: {
      'by-session': string
      'by-session-rank': [string, number]
    }
  }

  /**
   * Log clusters for a session.
   */
  clusters: {
    key: [string, string] // [sessionId, clusterId]
    value: LogCluster & {
      sessionId: string
    }
    indexes: {
      'by-session': string
    }
  }

  /**
   * Smart Context captures.
   */
  contexts: {
    key: [string, number] // [sessionId, anomalyEntryId]
    value: SmartContext & {
      sessionId: string
    }
    indexes: {
      'by-session': string
    }
  }

  /**
   * User preferences (singleton-ish, keyed by 'default').
   */
  settings: {
    key: string
    value: {
      id: string
      preferredModel: string
      thresholdK: number
      windowSize: number
      clusterThreshold: number
      theme: 'dark' | 'light'
      maxSessionAge: number // days before auto-prune
    }
  }
}

// Database version and store creation:
// src/storage/db.ts

import { openDB, type IDBPDatabase } from 'idb'
import type { LogiLogDB } from './schema'

const DB_NAME = 'LogiLog'
const DB_VERSION = 1

export async function getDB(): Promise<IDBPDatabase<LogiLogDB>> {
  return openDB<LogiLogDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Sessions
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
      sessions.createIndex('by-created', 'createdAt')

      // Log entries
      const logs = db.createObjectStore('logEntries', { keyPath: ['sessionId', 'id'] })
      logs.createIndex('by-session', 'sessionId')
      logs.createIndex('by-session-timestamp', ['sessionId', 'timestamp'])
      logs.createIndex('by-session-level', ['sessionId', 'level'])

      // Embedding chunks
      const emb = db.createObjectStore('embeddingChunks', {
        keyPath: ['sessionId', 'chunkIndex'],
      })
      emb.createIndex('by-session', 'sessionId')

      // Anomalies
      const anomalies = db.createObjectStore('anomalies', {
        keyPath: ['sessionId', 'entryId'],
      })
      anomalies.createIndex('by-session', 'sessionId')
      anomalies.createIndex('by-session-rank', ['sessionId', 'rank'])

      // Clusters
      const clusters = db.createObjectStore('clusters', {
        keyPath: ['sessionId', 'id'],
      })
      clusters.createIndex('by-session', 'sessionId')

      // Contexts
      const contexts = db.createObjectStore('contexts', {
        keyPath: ['sessionId', 'anomalyEntryId'],
      })
      contexts.createIndex('by-session', 'sessionId')

      // Settings
      db.createObjectStore('settings', { keyPath: 'id' })
    },
  })
}
```

---

### 3.6 UI / Rendering Module

**Location:** `src/ui/`

**Responsibility:** Present log data, analysis results, anomalies, and clusters to the user
in a responsive, terminal-aesthetic interface.

**Key Views:**

| View               | Description                                                   | Key Component       |
| ------------------ | ------------------------------------------------------------- | ------------------- |
| **Landing**        | Drop zone / file picker, past sessions list                   | `<LandingPage>`     |
| **Progress**       | Model loading, file parsing, analysis progress bars           | `<ProgressOverlay>` |
| **Timeline**       | Zoomable time-series chart of log volume, colored by severity | `<TimelineChart>`   |
| **Log Table**      | Virtualized table of all log entries with severity filters    | `<LogTable>`        |
| **Anomaly Report** | Ranked list of anomalies with Smart Context expandable panels | `<AnomalyReport>`   |
| **Cluster View**   | Collapsible groups of similar entries with pattern counts     | `<ClusterView>`     |
| **Settings**       | Model selection, threshold tuning, theme toggle               | `<SettingsPanel>`   |

**Design Language:**

- Dark terminal aesthetic by default (monospace font, dark background, high-contrast
  severity colors: red for ERROR/FATAL, amber for WARN, green for INFO, gray for DEBUG).
- Responsive but desktop-first. Log analysis is inherently a wide-screen activity.
- All long-running operations show a labeled progress indicator within 1 second
  (the "5-second rule" from the seed doc is tightened to 1s for perceived responsiveness).

**Virtualization Strategy:**

Log files can contain millions of lines. The `<LogTable>` component uses `react-window`
`VariableSizeList` to render only visible rows. Each row is measured once and cached.
Scrolling performance target: 60 fps with 1M+ entries in the dataset.

**Chart Architecture:**

The `<TimelineChart>` uses Recharts `<AreaChart>` with data bucketed into time intervals
(auto-scaled: 1s, 10s, 1m, 5m, 1h depending on total time range). Anomaly markers are
rendered as `<ReferenceDot>` overlays. The chart supports brush-based zoom via
`<Brush>` component.

---

## 4. Data Flow

The following describes the complete pipeline from file selection to anomaly report.

```
Step 1: FILE SELECTION
  User picks file via File System Access API (or <input> fallback)
  Main thread obtains a FileSystemFileHandle or File object

Step 2: SESSION CREATION
  Main thread creates a new Session record in IndexedDB (status: 'ingesting')
  Zustand store is updated with the new session ID and status

Step 3: INGESTION (Ingestion Worker)
  Main thread transfers the File/handle to the Ingestion Worker via Comlink
  Worker streams the file in 1 MB chunks:
    3a. TextDecoderStream -> line splitter TransformStream
    3b. Each line is parsed via the auto-detected LogParser
    3c. Parsed entries are batched (500 lines per batch)
    3d. Each batch is sent to main thread via Comlink (Transferable ArrayBuffers)
    3e. Main thread writes batch to IndexedDB 'logEntries' store
    3f. Main thread updates Zustand progress (lines parsed / estimated total)

Step 4: MODEL INITIALIZATION (Inference Worker, parallel with Step 3)
  On session start, the Inference Worker begins loading the model:
    4a. Check WebGPU availability -> select device
    4b. Load model via pipeline('feature-extraction', modelId, { device, dtype })
    4c. Model weights are fetched from HuggingFace Hub (first run)
        or loaded from OPFS cache (subsequent runs)
    4d. Report loading progress to main thread -> UI shows model progress bar

Step 5: EMBEDDING GENERATION (Inference Worker)
  As parsed batches arrive, they are queued for embedding:
    5a. Texts are sent to Inference Worker in micro-batches of 32
    5b. Worker runs forward pass, returns L2-normalized Float32Array
    5c. Embeddings are stored in IndexedDB 'embeddingChunks' (groups of 1000)
    5d. Session status updated to 'embedding'

Step 6: ANOMALY DETECTION (Analysis Worker)
  Once embeddings are available, analysis begins (can start before all embeddings are done):
    6a. Analysis Worker reads embedding chunks from IndexedDB
    6b. Sliding window cosine distance computed for each entry
    6c. Adaptive threshold calculated (mean + k * stddev)
    6d. Entries exceeding threshold are flagged as anomalies
    6e. Anomalies are ranked by distance score (descending)
    6f. Results written to IndexedDB 'anomalies' store
    6g. Session status updated to 'analyzing'

Step 7: CLUSTERING (Analysis Worker, parallel with Step 6)
  7a. Greedy leader clustering over all embeddings
  7b. Cluster centroids and member lists computed
  7c. Representative entry selected per cluster (closest to centroid)
  7d. Results written to IndexedDB 'clusters' store

Step 8: SMART CONTEXT (Context Worker)
  For each detected anomaly (up to top 50):
    8a. Read context window from IndexedDB logEntries
    8b. Identify trigger point and forensic patterns
    8c. Generate template-based narrative
    8d. Write SmartContext record to IndexedDB

Step 9: PRESENTATION
  Session status -> 'complete'
  UI subscribes to Zustand store updates and renders:
    - TimelineChart with anomaly markers
    - AnomalyReport with expandable Smart Contexts
    - ClusterView with grouped patterns
    - LogTable with full dataset (virtualized)
```

**Pipeline Parallelism:**

Steps 3 and 4 run in parallel. Step 5 begins as soon as both Step 3 produces its first
batch AND Step 4 completes model loading. Steps 6 and 7 run in parallel within the
Analysis Worker. Step 8 runs as anomalies are detected (streaming). This pipeline design
ensures the user sees progressive results rather than waiting for the entire file to be
processed before seeing anything.

---

## 5. Web Worker Architecture

### 5.1 Worker Topology

```
Main Thread
  |
  |-- Comlink.wrap() --> Ingestion Worker  (1 instance)
  |-- Comlink.wrap() --> Inference Worker   (1 instance, owns GPU context)
  |-- Comlink.wrap() --> Analysis Worker    (1 instance)
  |-- Comlink.wrap() --> Context Worker     (1 instance)
```

Four dedicated workers, each with a single responsibility. The Inference Worker is
necessarily a singleton because WebGPU adapters are per-origin and model loading is
expensive. The Ingestion Worker is singleton because file handles cannot be cloned
across workers. Analysis and Context workers are singleton for simplicity but could be
scaled to multiple instances in a future version.

### 5.2 Communication Protocol

All worker communication uses **Comlink** for ergonomic RPC. Under the hood, Comlink
uses `postMessage` with `Proxy` wrappers. Critical payloads use `Comlink.transfer()` to
pass ownership of `ArrayBuffer`s without copying.

```typescript
// src/workers/protocol.ts -- Message types for documentation / debugging

/**
 * These types are NOT used at runtime (Comlink abstracts them away).
 * They serve as documentation of the logical messages exchanged.
 */

// Main -> Ingestion Worker
export type IngestCommand = { type: 'START_INGEST'; file: File } | { type: 'ABORT_INGEST' }

// Ingestion Worker -> Main
export type IngestEvent =
  | { type: 'BATCH_READY'; batch: ParsedBatch }
  | { type: 'FORMAT_DETECTED'; parserName: string }
  | { type: 'INGEST_COMPLETE'; totalLines: number }
  | { type: 'INGEST_ERROR'; error: string }

// Main -> Inference Worker
export type InferCommand =
  | { type: 'INIT_MODEL'; modelId: string }
  | { type: 'EMBED_BATCH'; texts: string[] }
  | { type: 'DISPOSE' }

// Inference Worker -> Main
export type InferEvent =
  | { type: 'MODEL_LOADING'; progress: number }
  | { type: 'MODEL_READY'; device: 'webgpu' | 'wasm' }
  | { type: 'EMBEDDINGS_READY'; vectors: Float32Array }
  | { type: 'INFER_ERROR'; error: string }

// Main -> Analysis Worker
export type AnalyzeCommand = { type: 'ANALYZE'; sessionId: string; config: AnalysisConfig }

// Analysis Worker -> Main
export type AnalyzeEvent =
  | { type: 'ANOMALIES_FOUND'; anomalies: AnomalyResult[] }
  | { type: 'CLUSTERS_READY'; clusters: LogCluster[] }
  | { type: 'ANALYSIS_COMPLETE' }

// Main -> Context Worker
export type ContextCommand = { type: 'EXTRACT_CONTEXT'; sessionId: string; anomalyEntryId: number }

// Context Worker -> Main
export type ContextEvent = { type: 'CONTEXT_READY'; context: SmartContext }
```

### 5.3 Transferable Objects

Performance-critical data crossings use `Comlink.transfer()`:

| Data                     | Direction         | Transferred Type        |
| ------------------------ | ----------------- | ----------------------- |
| Parsed log batch strings | Ingestion -> Main | `ArrayBuffer` (encoded) |
| Embedding vectors        | Inference -> Main | `Float32Array.buffer`   |
| Embedding chunks         | Main -> Analysis  | `Float32Array.buffer`   |

All other messages (progress numbers, config objects, small result sets) use standard
structured clone, which is fast enough for small payloads.

### 5.4 Worker Instantiation (Vite)

```typescript
// src/workers/index.ts

import * as Comlink from 'comlink'
import type { InferenceEngine } from './inference.worker'
import type { IngestionEngine } from './ingestion.worker'
import type { AnalysisEngine } from './analysis.worker'
import type { ContextEngine } from './context.worker'

export function createIngestionWorker(): Comlink.Remote<IngestionEngine> {
  const worker = new Worker(new URL('./ingestion.worker.ts', import.meta.url), { type: 'module' })
  return Comlink.wrap<IngestionEngine>(worker)
}

export function createInferenceWorker(): Comlink.Remote<InferenceEngine> {
  const worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' })
  return Comlink.wrap<InferenceEngine>(worker)
}

export function createAnalysisWorker(): Comlink.Remote<AnalysisEngine> {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  return Comlink.wrap<AnalysisEngine>(worker)
}

export function createContextWorker(): Comlink.Remote<ContextEngine> {
  const worker = new Worker(new URL('./context.worker.ts', import.meta.url), { type: 'module' })
  return Comlink.wrap<ContextEngine>(worker)
}
```

### 5.5 Error Handling

Each worker wraps its Comlink-exposed API in try/catch. Errors are serialized as plain
objects (not Error instances, which do not survive structured clone in all browsers) and
re-thrown on the main thread side by Comlink. The Zustand store has a dedicated
`errors: WorkerError[]` array that the UI subscribes to for displaying error banners.

---

## 6. State Management

### 6.1 Choice: Zustand v5

**Rationale:**

| Criterion                 | Zustand                         | Jotai           | Redux Toolkit  | Signals (Preact) |
| ------------------------- | ------------------------------- | --------------- | -------------- | ---------------- |
| Bundle size               | ~1.5 kB                         | ~2 kB           | ~12 kB         | ~1 kB            |
| Boilerplate               | Minimal                         | Minimal         | Moderate       | Minimal          |
| Works outside React       | Yes (vanilla)                   | No (atom-based) | Yes (vanilla)  | No (Preact)      |
| Selector-based subscript. | Yes                             | Yes (atoms)     | Yes            | Automatic        |
| DevTools                  | Redux DevTools                  | Custom          | Redux DevTools | None             |
| Middleware                | Rich (immer, persist, devtools) | Limited         | Rich           | None             |

Zustand wins on: minimal boilerplate, works in both React and vanilla contexts (important
because worker orchestration logic can read store state), excellent selector-based
subscriptions (prevents re-renders of unrelated components), and built-in `persist`
middleware that can target IndexedDB.

### 6.2 Store Shape

```typescript
// src/store/index.ts

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface PipelineProgress {
  stage: 'idle' | 'ingesting' | 'loading-model' | 'embedding' | 'analyzing' | 'complete' | 'error'
  /** 0-100 for the current stage */
  percent: number
  /** Human-readable status message */
  message: string
}

export interface WorkerError {
  source: 'ingestion' | 'inference' | 'analysis' | 'context'
  message: string
  timestamp: number
}

export interface AppState {
  // --- Session ---
  currentSessionId: string | null
  sessions: Array<{ id: string; fileName: string; createdAt: number; status: string }>

  // --- Pipeline progress ---
  progress: PipelineProgress

  // --- Device info ---
  inferenceDevice: 'webgpu' | 'wasm' | null
  detectedParser: string | null

  // --- View state ---
  activeView: 'landing' | 'analysis' | 'settings'
  selectedAnomalyId: number | null
  timelineZoom: { start: number; end: number } | null
  levelFilter: Set<LogLevel>

  // --- Analysis summary (derived from IDB, cached here for UI) ---
  totalLines: number
  anomalyCount: number
  clusterCount: number
  topAnomalies: AnomalyResult[] // top 10 for quick display

  // --- Errors ---
  errors: WorkerError[]

  // --- Actions ---
  setSession: (id: string, fileName: string) => void
  updateProgress: (progress: Partial<PipelineProgress>) => void
  setInferenceDevice: (device: 'webgpu' | 'wasm') => void
  setDetectedParser: (name: string) => void
  setActiveView: (view: AppState['activeView']) => void
  selectAnomaly: (id: number | null) => void
  setTimelineZoom: (zoom: AppState['timelineZoom']) => void
  toggleLevelFilter: (level: LogLevel) => void
  setSummary: (summary: {
    totalLines: number
    anomalyCount: number
    clusterCount: number
    topAnomalies: AnomalyResult[]
  }) => void
  addError: (error: WorkerError) => void
  clearErrors: () => void
  reset: () => void
}
```

### 6.3 Selector Patterns

To prevent unnecessary re-renders, components subscribe to specific slices:

```typescript
// Example: ProgressOverlay only re-renders when progress changes
const progress = useAppStore((state) => state.progress)

// Example: TimelineChart only re-renders when zoom or session changes
const zoom = useAppStore((state) => state.timelineZoom)
const sessionId = useAppStore((state) => state.currentSessionId)
```

---

## 7. Performance Targets

| Metric                            | Target             | Measurement Method                             |
| --------------------------------- | ------------------ | ---------------------------------------------- |
| First Contentful Paint            | < 1.5s             | Lighthouse on GitHub Pages                     |
| Time to Interactive               | < 3s               | Lighthouse on GitHub Pages                     |
| Model load (cached, WebGPU)       | < 3s               | `performance.now()` around `pipeline()` call   |
| Model load (first, WebGPU)        | < 30s (on 50Mbps)  | Same, including download                       |
| Model load (cached, WASM)         | < 5s               | Same                                           |
| Ingestion throughput              | > 100,000 lines/s  | Lines parsed / wall clock time                 |
| Embedding throughput (WebGPU)     | > 500 lines/s      | Batch of 32, amortized                         |
| Embedding throughput (WASM)       | > 50 lines/s       | Batch of 32, amortized                         |
| Cosine distance computation       | > 1M ops/s         | Pure dot product on Float32Array               |
| UI responsiveness during analysis | 60 fps             | Chrome DevTools Performance panel              |
| Main thread blocking              | < 16ms per frame   | Long Task API                                  |
| IndexedDB write throughput        | > 10,000 entries/s | Batched `put()` in single transaction          |
| Total memory (peak)               | < 2 GB             | `performance.measureUserAgentSpecificMemory()` |
| JS bundle size (gzipped)          | < 150 kB           | `vite build --report` (excludes ONNX/model)    |

**Bottleneck Analysis:**

The pipeline bottleneck is embedding generation. At 500 lines/s (WebGPU), a 1M-line file
takes ~33 minutes to fully embed. Mitigations:

1. **Progressive results.** Analysis begins before all embeddings are computed. Users see
   anomalies appearing in real-time as the pipeline progresses.
2. **Sampling mode.** For files > 500K lines, offer a "fast scan" mode that embeds only
   every Nth line (e.g., every 5th), reducing time to ~7 minutes.
3. **Severity pre-filter.** Only embed ERROR/WARN/FATAL lines for initial anomaly pass.
   INFO/DEBUG lines are clustered by regex pattern matching (no embedding needed).

---

## 8. Security & Privacy Model

### 8.1 Threat Model

LogiLog processes sensitive operational data (log files that may contain IP addresses,
credentials, API keys, PII). The security model is designed around a single guarantee:

> **No log data ever leaves the browser tab.**

### 8.2 Architecture-Level Guarantees

| Guarantee                 | Mechanism                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No network exfiltration   | Zero outbound network requests after initial page load (model weights are the only fetch, and are cached). CSP `connect-src 'self' https://huggingface.co` restricts all other origins. |
| No server-side processing | No backend. Static HTML/JS/CSS served from GitHub Pages.                                                                                                                                |
| Sandboxed execution       | Browser sandbox prevents file system access beyond the explicitly user-selected files.                                                                                                  |
| Cross-origin isolation    | COOP + COEP headers ensure the page runs in its own process group, preventing Spectre-class side-channel attacks from cross-origin iframes.                                             |
| Worker isolation          | Each Web Worker runs in its own thread with no DOM access. Workers communicate only via structured clone (no shared memory in this design).                                             |
| No telemetry              | Zero analytics, no tracking pixels, no error reporting to external services.                                                                                                            |
| Offline-capable           | After first visit + model download, the entire app works offline. Service worker caches all assets.                                                                                     |

### 8.3 Required HTTP Headers

These must be set on the static host (GitHub Pages `_headers` file or Cloudflare Pages):

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://huggingface.co https://cdn-lfs.hf.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:;
```

**Why COOP/COEP?**

- Required for `SharedArrayBuffer` (which ONNX Runtime may use internally for WASM SIMD).
- Required for `performance.measureUserAgentSpecificMemory()` (used for memory monitoring).
- Provides process isolation as a defense-in-depth measure.

### 8.4 Model Download Trust

The only external network requests are to `huggingface.co` and `cdn-lfs.hf.co` for model
weight downloads. These are ONNX format files. The integrity of downloaded models is
verified by ONNX Runtime's built-in checksum validation. After first download, models are
served from the OPFS cache with no network access.

---

## 9. Browser Compatibility Matrix

### 9.1 WebGPU Support (as of March 2026)

| Browser      | Platform              | WebGPU Status  | Notes                          |
| ------------ | --------------------- | -------------- | ------------------------------ |
| Chrome 113+  | Windows, macOS, CrOS  | Stable         | Full support since April 2023  |
| Chrome 121+  | Android 12+           | Stable         | Qualcomm/ARM GPUs only         |
| Edge 113+    | Windows, macOS        | Stable         | Chromium-based, mirrors Chrome |
| Firefox 141+ | Windows               | Stable         | Shipped Nov 2025               |
| Firefox 145+ | macOS (Apple Silicon) | Stable         | macOS Tahoe 26 required        |
| Firefox      | Linux, Android        | In development | Expected mid-2026              |
| Safari 26.0+ | macOS Tahoe 26        | Stable         | Shipped with macOS Tahoe       |
| Safari 26.0+ | iOS 26, iPadOS 26     | Stable         | Shipped with iOS/iPadOS 26     |

### 9.2 File System Access API Support

| Browser    | Full API | Fallback via `<input>`             |
| ---------- | -------- | ---------------------------------- |
| Chrome 86+ | Yes      | N/A                                |
| Edge 86+   | Yes      | N/A                                |
| Firefox    | No       | Yes (`browser-fs-access` polyfill) |
| Safari     | No       | Yes (`browser-fs-access` polyfill) |

### 9.3 Graceful Degradation Strategy

```
                 ┌─────────────────────┐
                 │  navigator.gpu      │
                 │  exists?            │
                 └──────┬──────────────┘
                   Yes  │         No
                        v              v
              ┌─────────────┐   ┌──────────────┐
              │ Request      │   │ Fall back to │
              │ GPU adapter  │   │ WASM backend │
              └──────┬───────┘   └──────┬───────┘
                     │                  │
              Adapter │ null            │
              granted │                 │
                      v                 v
              ┌─────────────┐   ┌──────────────┐
              │ WebGPU path │   │ WASM path    │
              │ (100x fast) │   │ (~10x slower │
              │             │   │  but works)  │
              └─────────────┘   └──────────────┘
```

The UI displays a banner indicating which backend is active:

- Green: "WebGPU accelerated"
- Yellow: "Running on CPU (WebAssembly) -- analysis will be slower"

### 9.4 Minimum Supported Browsers

| Feature Required          | Minimum Version                     |
| ------------------------- | ----------------------------------- |
| Web Workers (module type) | Chrome 80, Firefox 114, Safari 15   |
| IndexedDB v2              | All modern browsers                 |
| ReadableStream            | Chrome 43, Firefox 65, Safari 14.1  |
| TextDecoderStream         | Chrome 71, Firefox 105, Safari 14.1 |
| `structuredClone`         | Chrome 98, Firefox 94, Safari 15.4  |

**Hard floor:** Chrome 98 / Firefox 114 / Safari 15.4. Users on older browsers see a
"Browser not supported" message with upgrade instructions.

---

## 10. Monorepo vs Single App

### 10.1 Decision: Single Application (NOT a Monorepo)

**Rationale:**

LogiLog is a single-page application with no backend, no shared types between
client/server, and no separately deployable packages. A monorepo adds tooling complexity
(workspace resolution, hoisted dependencies, cross-package builds) with zero benefit.

| Criterion            | Monorepo                     | Single App                 |
| -------------------- | ---------------------------- | -------------------------- |
| Deployment targets   | N/A (static site only)       | 1 target = simpler         |
| Shared types         | No server = nothing to share | All types in `src/types/`  |
| Build complexity     | Turborepo/Nx config overhead | Single `vite build`        |
| CI/CD                | More config                  | Single workflow            |
| Developer onboarding | Higher barrier               | `pnpm install && pnpm dev` |

### 10.2 Directory Structure

```
LogiLog/
├── public/
│   ├── _headers              # COOP/COEP headers for GitHub Pages
│   └── favicon.svg
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Router + layout
│   ├── types/
│   │   ├── log.ts            # LogEntry, LogLevel, ParsedBatch
│   │   ├── analysis.ts       # AnomalyResult, LogCluster, AnalysisConfig
│   │   ├── context.ts        # SmartContext, ForensicPattern
│   │   └── worker.ts         # Worker message types (documentation)
│   ├── workers/
│   │   ├── index.ts          # Worker factory functions
│   │   ├── ingestion.worker.ts
│   │   ├── inference.worker.ts
│   │   ├── analysis.worker.ts
│   │   ├── context.worker.ts
│   │   └── parsers/
│   │       ├── registry.ts
│   │       ├── syslog.ts
│   │       ├── json.ts
│   │       ├── apache.ts
│   │       ├── nginx.ts
│   │       ├── k8s.ts
│   │       └── generic.ts
│   ├── storage/
│   │   ├── schema.ts         # LogiLogDB interface
│   │   ├── db.ts             # openDB wrapper
│   │   ├── sessions.ts       # Session CRUD
│   │   ├── logs.ts           # Log entry read/write
│   │   ├── embeddings.ts     # Embedding chunk read/write
│   │   └── prune.ts          # Auto-prune old sessions
│   ├── store/
│   │   ├── index.ts          # Zustand store definition
│   │   └── selectors.ts      # Reusable selector functions
│   ├── ui/
│   │   ├── components/
│   │   │   ├── LandingPage.tsx
│   │   │   ├── ProgressOverlay.tsx
│   │   │   ├── TimelineChart.tsx
│   │   │   ├── LogTable.tsx
│   │   │   ├── AnomalyReport.tsx
│   │   │   ├── ClusterView.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── DeviceBadge.tsx
│   │   │   └── ErrorBanner.tsx
│   │   ├── hooks/
│   │   │   ├── useAnalysisPipeline.ts   # Orchestrates the full pipeline
│   │   │   ├── useFileSelection.ts      # File System Access API wrapper
│   │   │   └── useSessionHistory.ts     # Past sessions from IDB
│   │   └── layouts/
│   │       └── AnalysisLayout.tsx
│   ├── lib/
│   │   ├── pipeline.ts       # Pipeline orchestrator (coordinates workers)
│   │   ├── format-detector.ts # Detects log format from sample lines
│   │   └── time-bucketing.ts  # Bucket log timestamps for timeline chart
│   └── styles/
│       └── index.css          # Tailwind base + terminal theme tokens
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.worker.json       # Separate tsconfig for worker files (no DOM lib)
├── package.json
├── pnpm-lock.yaml
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Pages deployment
└── docs/
    ├── seed.md
    └── system.md              # This document
```

---

## 11. Build System

### 11.1 Vite Configuration

```typescript
// vite.config.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],

  build: {
    target: 'esnext', // WebGPU requires modern syntax
    outDir: 'dist',
    sourcemap: true, // Debug production issues without exposing source
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks for caching efficiency
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': ['recharts'],
          'ml-runtime': ['@huggingface/transformers'],
          storage: ['idb'],
          'worker-utils': ['comlink'],
        },
      },
    },
  },

  worker: {
    format: 'es', // ES module workers
    plugins: () => [wasm(), topLevelAwait()],
  },

  optimizeDeps: {
    exclude: ['@huggingface/transformers'], // Let Vite handle ONNX WASM files as assets
  },

  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
```

### 11.2 Chunking Strategy

| Chunk                 | Contents                                     | Approx Size (gzip)  |
| --------------------- | -------------------------------------------- | ------------------- |
| `index-[hash].js`     | React app, UI components, store, routing     | ~60 kB              |
| `react-vendor-[hash]` | React, ReactDOM                              | ~40 kB              |
| `chart-vendor-[hash]` | Recharts                                     | ~35 kB              |
| `ml-runtime-[hash]`   | Transformers.js (loaded by Inference Worker) | ~50 kB (JS only)    |
| `storage-[hash]`      | idb library                                  | ~1.5 kB             |
| `worker-utils-[hash]` | Comlink                                      | ~1.1 kB             |
| Worker bundles (x4)   | Each worker's code                           | ~5-15 kB each       |
| ONNX WASM files       | `ort-wasm-simd*.wasm` (loaded on demand)     | ~5 MB (not gzipped) |

**WASM Handling:**

ONNX Runtime's `.wasm` files are placed in `public/` and loaded at runtime by the library.
They are NOT bundled into JS chunks. The `vite-plugin-wasm` plugin ensures proper MIME
type and CORS headers during development.

### 11.3 GitHub Pages Deployment

```yaml
# .github/workflows/deploy.yml

name: Deploy to GitHub Pages
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 11.4 COOP/COEP on GitHub Pages

GitHub Pages does not support custom headers natively. Two workarounds:

**Option A: Service Worker header injection (recommended for GitHub Pages)**

A service worker intercepts all responses and adds the required headers:

```typescript
// public/sw-headers.js
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const headers = new Headers(response.headers)
        headers.set('Cross-Origin-Opener-Policy', 'same-origin')
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }),
    )
  }
})
```

**Option B: Cloudflare Pages (recommended for production)**

Cloudflare Pages supports a `_headers` file natively, making header configuration trivial.
This is the recommended hosting platform if GitHub Pages header limitations cause issues.

---

## 12. Open Questions / Risks

### 12.1 High-Risk Items

| Risk                                              | Impact | Likelihood | Mitigation                                                                                                  |
| ------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| **WebGPU OOM on large models**                    | High   | Medium     | Default to smallest model (23 MB q4). Monitor `GPUDevice.lost` event. Auto-fallback to WASM.                |
| **Embedding throughput too slow for large files** | High   | High       | Sampling mode, severity pre-filter, progressive results. Accept that 1M+ lines = 30+ min analysis.          |
| **COOP/COEP on GitHub Pages**                     | Medium | High       | Service worker header injection (tested pattern). Cloudflare Pages as backup host.                          |
| **IndexedDB quota exceeded**                      | Medium | Medium     | Auto-prune sessions > 30 days. Warn user when approaching 1 GB. Monitor via `navigator.storage.estimate()`. |
| **Firefox WASM performance gap**                  | Medium | Medium     | Firefox on Linux/Android lacks WebGPU (mid-2026 target). WASM fallback is 10x slower. Document this.        |
| **Model weights download blocked by CDN**         | Low    | Low        | HuggingFace CDN is highly available. Could self-host weights on same origin as fallback.                    |

### 12.2 Open Design Questions

1. **Multi-file analysis.** The current design handles one file per session. Should we
   support analyzing multiple related files (e.g., app.log + db.log) in a single session
   with cross-file correlation? Deferred to v2.

2. **LLM-powered summarization.** The Smart Context module uses template-based narratives
   in v1. Loading a small generative model (e.g., `Xenova/Phi-3-mini-4k-instruct`) for
   plain-English summaries would greatly improve UX but adds ~1.5 GB of model weights and
   significant GPU memory pressure. Deferred to v2 with an explicit opt-in.

3. **Streaming analysis for real-time logs.** The current design analyzes static files.
   Supporting a streaming mode (e.g., tailing a log file) requires the File System Access
   API's `createSyncAccessHandle()` which is only available in OPFS, not user-selected files.
   This may require a different architecture (WebSocket to a local agent). Deferred.

4. **Quantization granularity.** The seed doc mentions both 4-bit and 8-bit quantization.
   The default is 4-bit (`q4`) for smallest footprint. Should we offer 8-bit (`q8`) as a
   "higher quality" option at the cost of ~2x model size? Yes, as a setting. Default remains q4.

5. **ONNX Runtime version pinning.** Transformers.js bundles a specific ONNX Runtime Web
   version. If a new ONNX Runtime release breaks compatibility, we are blocked until
   Transformers.js updates. Mitigation: pin `@huggingface/transformers` to exact version
   in `package.json`, test upgrades in CI.

6. **Safari WebGPU compute shader limitations.** Safari 26 ships WebGPU but the compute
   shader capabilities may differ from Chrome's implementation. ONNX Runtime's WebGPU EP
   may hit unsupported operations. Testing on Safari is required before claiming support.

### 12.3 Future Roadmap (Out of Scope for v1)

- **v1.1:** Export anomaly reports as JSON/CSV/PDF
- **v1.2:** Shareable analysis snapshots (export/import IndexedDB session)
- **v2.0:** LLM-powered plain-English narratives (optional large model)
- **v2.1:** Multi-file correlation analysis
- **v2.2:** Custom parser plugin system (user-defined regex patterns)
- **v3.0:** Real-time log streaming via local agent bridge

---

## Appendix A: Key Algorithms

### A.1 Sliding Window Anomaly Score

```typescript
function computeAnomalyScores(
  embeddings: Float32Array,
  dim: number,
  windowSize: number,
  thresholdK: number,
): AnomalyResult[] {
  const n = embeddings.length / dim
  const scores: number[] = new Array(n)

  for (let i = 0; i < n; i++) {
    const current = embeddings.subarray(i * dim, (i + 1) * dim)
    let totalDist = 0
    let count = 0

    const start = Math.max(0, i - windowSize)
    for (let j = start; j < i; j++) {
      const prev = embeddings.subarray(j * dim, (j + 1) * dim)
      totalDist += cosineDistance(current, prev)
      count++
    }

    scores[i] = count > 0 ? totalDist / count : 0
  }

  // Adaptive threshold
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length
  const stddev = Math.sqrt(variance)
  const threshold = mean + thresholdK * stddev

  // Build results
  const anomalies: AnomalyResult[] = scores
    .map((score, i) => ({
      entryId: i,
      distanceScore: score,
      isAnomaly: score > threshold,
      rank: 0,
    }))
    .filter((a) => a.isAnomaly)
    .sort((a, b) => b.distanceScore - a.distanceScore)
    .map((a, idx) => ({ ...a, rank: idx + 1 }))

  return anomalies
}
```

### A.2 Greedy Leader Clustering

```typescript
function clusterEmbeddings(
  embeddings: Float32Array,
  dim: number,
  messages: string[],
  similarityThreshold: number,
): LogCluster[] {
  const n = embeddings.length / dim
  const clusters: LogCluster[] = []

  for (let i = 0; i < n; i++) {
    const vec = embeddings.subarray(i * dim, (i + 1) * dim)
    let bestCluster: LogCluster | null = null
    let bestSim = -1

    for (const cluster of clusters) {
      const sim = cosineSimilarity(vec, cluster.centroid)
      if (sim > bestSim) {
        bestSim = sim
        bestCluster = cluster
      }
    }

    if (bestCluster && bestSim >= similarityThreshold) {
      // Add to existing cluster, update centroid (running average)
      const oldCount = bestCluster.count
      const newCount = oldCount + 1
      const centroid = bestCluster.centroid
      for (let d = 0; d < dim; d++) {
        centroid[d] = (centroid[d] * oldCount + vec[d]) / newCount
      }
      bestCluster.memberIds.push(i)
      bestCluster.count = newCount
    } else {
      // Create new cluster
      clusters.push({
        id: `cluster-${clusters.length}`,
        centroid: new Float32Array(vec),
        representative: messages[i],
        memberIds: [i],
        count: 1,
      })
    }
  }

  return clusters
}
```

---

## Appendix B: Glossary

| Term            | Definition                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| COOP            | Cross-Origin Opener Policy. HTTP header that isolates the browsing context.                          |
| COEP            | Cross-Origin Embedder Policy. HTTP header that prevents loading cross-origin resources without CORS. |
| Cosine Distance | `1 - cosine_similarity(A, B)`. Measures semantic dissimilarity between two vectors.                  |
| OPFS            | Origin Private File System. Browser-provided sandboxed file storage.                                 |
| ONNX            | Open Neural Network Exchange. Model interchange format used by Transformers.js.                      |
| Quantization    | Reducing model weight precision (e.g., 32-bit float to 4-bit integer) to reduce size and memory.     |
| Smart Context   | LogiLog's forensic capture of the 50-100 lines preceding an anomaly with causal chain analysis.      |
| Transferable    | Web API mechanism to transfer ownership of an ArrayBuffer to another thread without copying.         |
| WebGPU EP       | WebGPU Execution Provider in ONNX Runtime. Dispatches computation to the GPU.                        |
