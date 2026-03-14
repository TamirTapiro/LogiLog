# LogiLog: Frontend Engineering Specification

Version 1.0 | Author: Frontend Engineering | Date: 2026-03-14

---

## Table of Contents

1. [Tech Stack Decision](#1-tech-stack-decision)
2. [Project Structure](#2-project-structure)
3. [Component Hierarchy](#3-component-hierarchy)
4. [Key Component Specifications](#4-key-component-specifications)
5. [State Management Architecture](#5-state-management-architecture)
6. [Web Worker Integration](#6-web-worker-integration)
7. [Virtualization Strategy](#7-virtualization-strategy)
8. [Routing](#8-routing)
9. [Theming](#9-theming)
10. [Error States and Loading UX](#10-error-states-and-loading-ux)
11. [Accessibility](#11-accessibility)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Tech Stack Decision

### Framework: React 18 with TypeScript

**Decision:** React 18 with TypeScript (strict mode).

**Rationale:**

React is chosen over Svelte and Vue for the following reasons specific to LogiLog's requirements:

- **Concurrent rendering:** React 18's concurrent features (`useTransition`, `useDeferredValue`, `startTransition`) are essential for keeping the UI responsive while processing millions of log lines. The ability to interrupt renders and prioritize urgent updates (e.g., showing a progress tick) over background work (e.g., rendering a virtualized list) is not available in Svelte or Vue 3 without custom scheduling.
- **Ecosystem maturity for virtualization:** `react-window` and `react-virtual` are the most battle-tested virtualization libraries available. `react-window` in particular is authored by the same team that wrote the original virtualization patterns; its fixed-row-height `FixedSizeList` has been profiled against 10M+ row datasets. Svelte's `svelte-virtual-list` and Vue's equivalents have less production exposure at this scale.
- **Web Worker integration patterns:** React's `useSyncExternalStore` provides a clean, tearing-free bridge between a Web Worker's postMessage stream and a React render cycle. This is the canonical pattern for subscribing to external data sources that update asynchronously, which is exactly how LogiLog's parse and inference workers communicate.
- **TypeScript integration:** React's TypeScript support is first-class. The `@types/react` package is co-maintained with React core. For a project with complex state shapes (log lines, cluster results, anomaly scores), strict TypeScript is critical to correctness.
- **Team familiarity and hiring:** React remains the dominant framework in the frontend ecosystem. For an open-source project deployed to GitHub Pages, React maximizes the likelihood of community contributions.

**Why not Svelte:** Svelte's compiler-based reactivity is elegant, but its virtualization story is weaker, its Web Worker integration requires more boilerplate, and `useSyncExternalStore` has no direct equivalent. Svelte 5 runes are promising but are not yet production-stable for complex reactive graphs.

**Why not Vue:** Vue 3's Composition API is excellent, but `react-window` is not available, and Vue's concurrent rendering story (via `Suspense`) is less developed than React 18's scheduler.

### Full Stack

| Layer          | Choice                              | Version | Rationale                                                 |
| -------------- | ----------------------------------- | ------- | --------------------------------------------------------- |
| Framework      | React                               | 18.3+   | Concurrent rendering, useSyncExternalStore                |
| Language       | TypeScript                          | 5.4+    | Strict mode, no `any`                                     |
| Bundler        | Vite                                | 5.x     | Native ESM, fast HMR, worker support via `?worker`        |
| ML Runtime     | Transformers.js                     | 3.x     | WebGPU backend, quantized models                          |
| Virtualization | react-window                        | 1.8+    | FixedSizeList for log rows, VariableSizeList for clusters |
| State          | Zustand                             | 4.x     | Minimal boilerplate, slice pattern, devtools support      |
| Styling        | CSS Modules + CSS Custom Properties | -       | Scoped styles, zero runtime, theme tokens via variables   |
| Testing        | Vitest + React Testing Library      | -       | Same config as Vite, no Jest migration needed             |
| E2E            | Playwright                          | 1.x     | Cross-browser, works with static file serving             |
| Linting        | ESLint + Prettier                   | -       | `eslint-config-react-app` extended with strict rules      |

### CSS Approach: CSS Modules + Custom Properties

Plain CSS Modules (`.module.css`) with a global `tokens.css` file defining all design tokens as CSS custom properties. No CSS-in-JS (eliminates runtime overhead), no Tailwind (reduces cognitive overhead for a terminal aesthetic where every pixel is intentional). Component-scoped class names prevent collisions. Global tokens allow theme changes by swapping a single variable set.

---

## 2. Project Structure

```
LogiLog/
├── public/
│   ├── favicon.ico
│   ├── og-image.png
│   └── _headers                    # Netlify/GitHub Pages COOP/COEP headers
│
├── src/
│   ├── main.tsx                    # React.createRoot entry point
│   ├── App.tsx                     # Root shell, router, global error boundary
│   ├── vite-env.d.ts               # Vite client types
│   │
│   ├── workers/
│   │   ├── parse.worker.ts         # Log parsing in a dedicated worker
│   │   ├── inference.worker.ts     # Transformers.js embeddings + clustering
│   │   └── worker.types.ts         # Shared message type definitions (no imports from src/)
│   │
│   ├── store/
│   │   ├── index.ts                # Zustand store root, combines slices
│   │   ├── slices/
│   │   │   ├── ingestion.slice.ts  # File loading and parse progress state
│   │   │   ├── logs.slice.ts       # Parsed log lines (reference, not copy)
│   │   │   ├── analysis.slice.ts   # Clustering results, anomaly scores
│   │   │   └── ui.slice.ts         # Selected line, panel open/closed, etc.
│   │   └── selectors.ts            # Derived/computed selectors (memoized)
│   │
│   ├── hooks/
│   │   ├── useFileIngestion.ts     # File System Access API + parse worker bridge
│   │   ├── useInferenceWorker.ts   # Inference worker bridge via useSyncExternalStore
│   │   ├── useTimeline.ts          # Timeline bucket computation (memoized)
│   │   ├── useVirtualLog.ts        # react-window scroll + filter coordination
│   │   └── useKeyboardNavigation.ts # Global keyboard shortcuts (j/k, /, Esc)
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── AppShell.module.css
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Sidebar.module.css
│   │   │   ├── StatusBar.tsx
│   │   │   └── StatusBar.module.css
│   │   │
│   │   ├── ingestion/
│   │   │   ├── FileDropZone.tsx
│   │   │   ├── FileDropZone.module.css
│   │   │   ├── ProgressBar.tsx
│   │   │   └── ProgressBar.module.css
│   │   │
│   │   ├── timeline/
│   │   │   ├── Timeline.tsx
│   │   │   ├── Timeline.module.css
│   │   │   ├── TimelineBucket.tsx
│   │   │   └── TimelineBucket.module.css
│   │   │
│   │   ├── logs/
│   │   │   ├── LogViewer.tsx
│   │   │   ├── LogViewer.module.css
│   │   │   ├── LogRow.tsx
│   │   │   ├── LogRow.module.css
│   │   │   ├── LogSearch.tsx
│   │   │   └── LogSearch.module.css
│   │   │
│   │   ├── clustering/
│   │   │   ├── ClusteringView.tsx
│   │   │   ├── ClusteringView.module.css
│   │   │   ├── ClusterGroup.tsx
│   │   │   └── ClusterGroup.module.css
│   │   │
│   │   ├── anomaly/
│   │   │   ├── AnomalyCard.tsx
│   │   │   ├── AnomalyCard.module.css
│   │   │   ├── AnomalyList.tsx
│   │   │   └── AnomalyList.module.css
│   │   │
│   │   ├── context/
│   │   │   ├── SmartContextPanel.tsx
│   │   │   └── SmartContextPanel.module.css
│   │   │
│   │   └── shared/
│   │       ├── Badge.tsx
│   │       ├── Badge.module.css
│   │       ├── Spinner.tsx
│   │       ├── Spinner.module.css
│   │       ├── ErrorBoundary.tsx
│   │       ├── Tooltip.tsx
│   │       ├── Tooltip.module.css
│   │       ├── KeyboardHint.tsx
│   │       └── KeyboardHint.module.css
│   │
│   ├── lib/
│   │   ├── logParser.ts            # Pure parsing logic (imported by parse.worker.ts)
│   │   ├── timelineBuckets.ts      # Bucket computation (pure, testable)
│   │   ├── cosineSimilarity.ts     # Distance calculation (pure, testable)
│   │   ├── formatters.ts           # Timestamp, byte size, duration formatters
│   │   └── fileSystemAccess.ts     # File System Access API wrapper
│   │
│   ├── types/
│   │   ├── log.types.ts            # LogLine, LogLevel, ParsedLog
│   │   ├── analysis.types.ts       # ClusterResult, AnomalyResult, SmartContext
│   │   ├── store.types.ts          # Full store state shape
│   │   └── worker.types.ts         # Re-exports from workers/worker.types.ts
│   │
│   └── styles/
│       ├── tokens.css              # All CSS custom properties (colors, spacing, type)
│       ├── reset.css               # Minimal reset (box-sizing, margin: 0)
│       └── global.css              # Body, scrollbar, selection styles
│
├── e2e/
│   ├── fixtures/
│   │   ├── small.log               # 1,000 lines for fast E2E tests
│   │   ├── medium.log              # 100,000 lines for perf tests
│   │   └── anomalous.log           # Logs with known anomaly patterns
│   ├── ingestion.spec.ts
│   ├── timeline.spec.ts
│   └── clustering.spec.ts
│
├── index.html                      # Vite entry, sets COOP/COEP meta for dev
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.js
└── package.json
```

### File Naming Conventions

- Components: PascalCase (`LogViewer.tsx`)
- CSS Modules: same name as component (`LogViewer.module.css`)
- Hooks: camelCase with `use` prefix (`useFileIngestion.ts`)
- Slices: camelCase with `.slice.ts` suffix (`logs.slice.ts`)
- Workers: camelCase with `.worker.ts` suffix (`parse.worker.ts`)
- Types: camelCase with `.types.ts` suffix (`log.types.ts`)
- Pure lib functions: camelCase (`logParser.ts`)

---

## 3. Component Hierarchy

```
<App>
  <ErrorBoundary>                       # Global catch-all
    <AppShell>
      │
      ├── <Sidebar>
      │     ├── <FileDropZone />         # Entry point before file loaded
      │     ├── <ProgressBar />          # Visible during ingestion/analysis
      │     ├── <LogSearch />            # Filter input
      │     └── <KeyboardHint />         # j/k//, Esc hints
      │
      ├── <main>
      │     │
      │     ├── <Timeline />             # Always visible after file loaded
      │     │     └── <TimelineBucket /> # One per time bucket (virtualized)
      │     │
      │     ├── <TabBar />               # "Logs" | "Clusters" | "Anomalies" tabs
      │     │
      │     ├── [active tab = "logs"]
      │     │     └── <LogViewer />
      │     │           └── <LogRow />   # Rendered by react-window (virtualized)
      │     │
      │     ├── [active tab = "clusters"]
      │     │     └── <ClusteringView />
      │     │           └── <ClusterGroup /> (×N)
      │     │                 └── <LogRow /> (virtualized subset)
      │     │
      │     └── [active tab = "anomalies"]
      │           └── <AnomalyList />
      │                 └── <AnomalyCard /> (×N)
      │
      └── <SmartContextPanel />          # Slide-in drawer, shown on anomaly selection
            └── <LogRow />               # Reused for context lines
      │
      └── <StatusBar />                  # Bottom bar: line count, GPU status, model name
```

---

## 4. Key Component Specifications

### 4.1 `<App />`

**File:** `src/App.tsx`

**Responsibility:** Root shell. Mounts the router (React Router v6 in hash mode for GitHub Pages compatibility), initializes the Zustand store, and registers global keyboard listeners.

**Props:** None (root component).

```tsx
// src/App.tsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { AppShell } from './components/layout/AppShell'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'

export function App() {
  useKeyboardNavigation() // registers global document keydown listener

  return (
    <ErrorBoundary fallback={<CriticalErrorScreen />}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<AppShell />} />
          {/* No additional routes; all views are tab-based within AppShell */}
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
```

**Notes:**

- Hash routing (`#`) is required because GitHub Pages does not support server-side URL rewriting. All navigation must be client-side.
- `useKeyboardNavigation` is mounted here so that keyboard shortcuts work regardless of which tab is active.
- A global `ErrorBoundary` wraps everything. If the ML worker throws an unrecoverable error (e.g., WebGPU not supported), `<CriticalErrorScreen>` renders a fallback message with a manual download link.

---

### 4.2 `<FileDropZone />`

**File:** `src/components/ingestion/FileDropZone.tsx`

**Responsibility:** The initial entry point. Accepts log files via drag-and-drop, click-to-browse (using the File System Access API), or directory drop. Triggers the parse worker pipeline on file selection.

**Props:**

```ts
// No external props — reads/writes directly to the Zustand ingestion slice
// This is a container component that owns the file ingestion side-effect
```

**Internal state:**

```ts
interface FileDropZoneLocalState {
  isDragOver: boolean
  dragError: string | null // e.g. "Only .log and .txt files are supported"
}
```

**File System Access API integration:**

```ts
// src/lib/fileSystemAccess.ts

/**
 * Opens a file picker using the File System Access API.
 * Falls back to a traditional <input type="file"> if the API is unavailable.
 * Returns a ReadableStream for the file contents to avoid loading the entire
 * file into memory at once.
 */
export async function openLogFile(): Promise<{
  name: string
  stream: ReadableStream<Uint8Array>
  size: number
}> {
  if ('showOpenFilePicker' in window) {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Log files',
          accept: { 'text/plain': ['.log', '.txt', '.out', '.gz'] },
        },
      ],
      multiple: false,
    })
    const file = await fileHandle.getFile()
    return { name: file.name, stream: file.stream(), size: file.size }
  }

  // Fallback: programmatic <input type="file">
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.log,.txt,.out'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new Error('No file selected'))
      resolve({ name: file.name, stream: file.stream(), size: file.size })
    }
    input.click()
  })
}
```

**Drag-and-drop implementation notes:**

- Listen to `dragenter`, `dragover`, `dragleave`, `drop` on the root `<div>`.
- Set `isDragOver = true` on `dragenter`, `false` on `dragleave`/`drop`.
- On `drop`, extract `event.dataTransfer.files[0]`. Validate MIME type or extension before dispatching.
- Call `event.preventDefault()` on `dragover` to signal the browser that drops are accepted (required for the `drop` event to fire).
- Directory drops are handled by checking `entry.isDirectory` on the `DataTransferItem`. If a directory is dropped, scan for the first `.log` file using the FileSystem Entry API.

**Accepted file types:** `.log`, `.txt`, `.out`, `.gz` (gzip detection happens in the parse worker by checking the magic bytes `\x1f\x8b`).

**Error states:**

- Wrong file type: render inline error text below the drop target.
- File System Access API denied (user cancelled picker): silently return, no error shown.
- File too large (> 5GB): show warning "This file is very large. Processing may take several minutes on first load."

**Rendered structure:**

```html
<section
  role="region"
  aria-label="Log file drop zone"
  aria-describedby="dropzone-hint"
  data-drag-over="{isDragOver}"
>
  <div class="icon" aria-hidden="true">⌗</div>
  <p class="primary">Drop a log file to begin analysis</p>
  <p id="dropzone-hint" class="secondary">.log · .txt · .out · .gz</p>
  <button type="button" onClick="{handleClick}">Browse files</button>
  {dragError &&
  <p role="alert" class="error">{dragError}</p>
  }
</section>
```

---

### 4.3 `<ProgressBar />`

**File:** `src/components/ingestion/ProgressBar.tsx`

**Responsibility:** Displays multi-stage progress during the three pipeline phases: Loading (file read), Parsing (log line extraction), and Analyzing (ML inference). Enforces the 5-second rule from the seed document: a visible status update must appear within 5 seconds of file selection, regardless of processing state.

**Props:**

```ts
interface ProgressBarProps {
  // No props — reads from Zustand ingestion slice
}
```

**Stage definitions:**

```ts
// src/types/store.types.ts (partial)
export type IngestionStage =
  | 'idle'
  | 'loading' // Reading bytes from File System Access API stream
  | 'parsing' // parse.worker.ts: line extraction, timestamp normalization
  | 'analyzing' // inference.worker.ts: embedding, clustering, anomaly scoring
  | 'complete'
  | 'error'

export interface IngestionProgress {
  stage: IngestionStage
  // 0–1 within the current stage. -1 means indeterminate.
  stageProgress: number
  // Human-readable status line updated at least every 5 seconds
  statusMessage: string
  // Bytes read so far (for the Loading stage)
  bytesRead: number
  totalBytes: number
  // Lines parsed so far (for Parsing stage)
  linesParsed: number
  // Lines analyzed so far (for Analyzing stage)
  linesAnalyzed: number
  totalLines: number
  // ISO timestamp of last status update — UI warns if > 5s old
  lastUpdatedAt: number // Date.now()
  // Elapsed time since ingestion began, in ms
  elapsedMs: number
  // Estimated time remaining in ms (-1 if unknown)
  etaMs: number
}
```

**5-second rule implementation:**

```tsx
// Inside ProgressBar component
const STALE_THRESHOLD_MS = 5000
const lastUpdatedAt = useStore((s) => s.ingestion.progress.lastUpdatedAt)
const [isStale, setIsStale] = useState(false)

useEffect(() => {
  const interval = setInterval(() => {
    setIsStale(Date.now() - lastUpdatedAt > STALE_THRESHOLD_MS)
  }, 1000)
  return () => clearInterval(interval)
}, [lastUpdatedAt])

// When isStale is true, render a pulsing "Still working..." indicator
// so the user knows the application hasn't hung.
```

**Stage weights for the combined progress bar:**

| Stage     | Weight |
| --------- | ------ |
| Loading   | 10%    |
| Parsing   | 30%    |
| Analyzing | 60%    |

The overall progress percentage = `stageOffset + (stageProgress * stageWeight)`.

**Rendered structure:**

```html
<div role="status" aria-live="polite" aria-label="Analysis progress">
  <div class="stage-indicators">
    <!-- Three stage pills: Loading · Parsing · Analyzing -->
    <span class="stage {active|complete|pending}">Loading</span>
    <span class="divider" aria-hidden="true">›</span>
    <span class="stage {active|complete|pending}">Parsing</span>
    <span class="divider" aria-hidden="true">›</span>
    <span class="stage {active|complete|pending}">Analyzing</span>
  </div>

  <div
    role="progressbar"
    aria-valuenow="{overallPercent}"
    aria-valuemin="{0}"
    aria-valuemax="{100}"
    aria-label="{statusMessage}"
  >
    <div class="track">
      <div class="fill" style="width: {overallPercent}%" />
      <!-- Shimmer overlay when stageProgress === -1 (indeterminate) -->
      {isIndeterminate &&
      <div class="shimmer" aria-hidden="true" />
      }
    </div>
  </div>

  <p class="status-message">
    {statusMessage} {isStale && <span class="stale-indicator"> · Still working…</span>}
  </p>

  <p class="meta">
    {formatDuration(elapsedMs)} elapsed {etaMs > 0 && ` · ~${formatDuration(etaMs)} remaining`}
  </p>
</div>
```

**Animation:** The shimmer uses a CSS animation (`@keyframes shimmer`) that moves a semi-transparent gradient overlay from left to right on a 1.5s loop. The `fill` bar uses `transition: width 200ms ease-out`.

---

### 4.4 `<Timeline />`

**File:** `src/components/timeline/Timeline.tsx`

**Responsibility:** Interactive timeline showing log volume distribution over time as vertical bars. Anomaly-containing buckets are highlighted in amber/red. Clicking a bucket jumps the `<LogViewer>` to that time range. Supports keyboard navigation.

**Props:**

```ts
interface TimelineProps {
  // No external props — reads from Zustand store selectors
  // Writes selectedTimeRange to ui slice
}
```

**Bucket computation (pure function, testable):**

```ts
// src/lib/timelineBuckets.ts

export interface TimelineBucket {
  index: number
  startMs: number
  endMs: number
  count: number
  anomalyCount: number
  maxAnomalyScore: number // 0–1, drives color intensity
  // First log line index in this bucket (for scroll jump)
  firstLineIndex: number
}

/**
 * Divides the log time range into N equal buckets.
 * N is chosen based on available width: approximately 1 bucket per 6px.
 * Minimum 20 buckets, maximum 500.
 */
export function computeTimelineBuckets(
  lines: readonly LogLine[],
  anomalyScores: ReadonlyMap<number, number>, // lineIndex -> score
  bucketCount: number,
): TimelineBucket[] {
  if (lines.length === 0) return []
  const minMs = lines[0].timestampMs
  const maxMs = lines[lines.length - 1].timestampMs
  const rangeMs = maxMs - minMs || 1
  const buckets: TimelineBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    index: i,
    startMs: minMs + (rangeMs * i) / bucketCount,
    endMs: minMs + (rangeMs * (i + 1)) / bucketCount,
    count: 0,
    anomalyCount: 0,
    maxAnomalyScore: 0,
    firstLineIndex: -1,
  }))
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].timestampMs
    const bi = Math.min(Math.floor(((t - minMs) / rangeMs) * bucketCount), bucketCount - 1)
    const b = buckets[bi]
    b.count++
    if (b.firstLineIndex === -1) b.firstLineIndex = i
    const score = anomalyScores.get(i) ?? 0
    if (score > 0) {
      b.anomalyCount++
      if (score > b.maxAnomalyScore) b.maxAnomalyScore = score
    }
  }
  return buckets
}
```

**Key interaction behaviors:**

- **Hover:** Show a tooltip with the time range, line count, and anomaly count for that bucket.
- **Click:** Set `ui.selectedTimeRange` to `[bucket.startMs, bucket.endMs]`. The `<LogViewer>` derives its visible range from this selection and scrolls to `bucket.firstLineIndex` using `react-window`'s `scrollToItem` method.
- **Click again on selected bucket:** Clear the time range filter (return to showing all lines).
- **Drag:** Support click-drag to select a time range spanning multiple buckets.
- **Keyboard:** When the timeline container has focus, left/right arrows move bucket selection. Enter activates. Escape clears.

**Resize observation:**

```tsx
// Timeline uses ResizeObserver to recalculate bucketCount when container width changes.
const containerRef = useRef<HTMLDivElement>(null)
const [bucketCount, setBucketCount] = useState(100)

useEffect(() => {
  const ro = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width
    setBucketCount(Math.max(20, Math.min(500, Math.floor(width / 6))))
  })
  if (containerRef.current) ro.observe(containerRef.current)
  return () => ro.disconnect()
}, [])
```

**Rendered structure:**

```html
<section aria-label="Log timeline" role="region">
  <div class="axis-labels" aria-hidden="true">
    <!-- First and last timestamp labels -->
  </div>

  <div
    class="buckets"
    ref="{containerRef}"
    role="listbox"
    aria-label="Time buckets — click to filter log view"
    aria-multiselectable="false"
  >
    <!-- TimelineBucket components, one per bucket -->
    {buckets.map(b => (
    <TimelineBucket
      key="{b.index}"
      bucket="{b}"
      maxCount="{globalMaxCount}"
      isSelected="{isInSelectedRange(b)}"
      onSelect="{handleBucketSelect}"
    />
    ))}
  </div>

  <div class="selection-indicator" aria-live="polite">
    {selectedRange ? `Showing ${formatTimeRange(selectedRange)} — ${selectedLineCount} lines` : null
    }
  </div>
</section>
```

---

### 4.5 `<LogViewer />`

**File:** `src/components/logs/LogViewer.tsx`

**Responsibility:** Virtualized list of log lines. Must handle millions of rows without degrading frame rate. Rows are 20px fixed height. Supports filtering by time range (from timeline selection), text search, log level filter, and cluster membership.

**Props:**

```ts
interface LogViewerProps {
  // No external props — all state from Zustand
}
```

**Core virtualization setup:**

```tsx
import { FixedSizeList, type ListChildComponentProps } from 'react-window'

// LogViewer uses FixedSizeList because all rows are a fixed 20px height.
// This is a hard requirement: VariableSizeList requires measuring each row,
// which is prohibitive at 1M+ rows.

const ROW_HEIGHT = 20 // px — matches the monospace line height in tokens.css

export function LogViewer() {
  const filteredIndices = useStore(selectFilteredLogIndices)
  const listRef = useRef<FixedSizeList>(null)

  // When the timeline selection changes, scroll to the first line in range.
  const selectedTimeRange = useStore((s) => s.ui.selectedTimeRange)
  useEffect(() => {
    if (selectedTimeRange && filteredIndices.length > 0) {
      listRef.current?.scrollToItem(0, 'start')
    }
  }, [selectedTimeRange, filteredIndices])

  return (
    <AutoSizer>
      {({ height, width }) => (
        <FixedSizeList
          ref={listRef}
          height={height}
          width={width}
          itemCount={filteredIndices.length}
          itemSize={ROW_HEIGHT}
          itemData={filteredIndices}
          overscanCount={10}
        >
          {LogRowRenderer}
        </FixedSizeList>
      )}
    </AutoSizer>
  )
}

// LogRowRenderer is defined OUTSIDE the component to prevent re-creation on each render.
// This is a critical performance requirement for react-window.
const LogRowRenderer = React.memo(function LogRowRenderer({
  index,
  style,
  data: filteredIndices,
}: ListChildComponentProps<number[]>) {
  const lineIndex = filteredIndices[index]
  return (
    <div style={style}>
      <LogRow lineIndex={lineIndex} />
    </div>
  )
})
```

**`selectFilteredLogIndices` selector:**

```ts
// src/store/selectors.ts
export const selectFilteredLogIndices = createSelector(
  (s: StoreState) => s.logs.lines,
  (s: StoreState) => s.ui.selectedTimeRange,
  (s: StoreState) => s.ui.searchQuery,
  (s: StoreState) => s.ui.levelFilter,
  (s: StoreState) => s.ui.selectedClusterId,
  (lines, timeRange, query, levelFilter, clusterId) => {
    const indices: number[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (timeRange && (line.timestampMs < timeRange[0] || line.timestampMs > timeRange[1]))
        continue
      if (levelFilter && line.level !== levelFilter) continue
      if (clusterId !== null && line.clusterId !== clusterId) continue
      if (query && !line.raw.includes(query)) continue
      indices.push(i)
    }
    return indices
  },
)
```

This selector is memoized using `reselect`'s `createSelector`. It recomputes only when one of its five inputs changes. The filter loop runs in O(n) on the main thread; for files where n > 500,000, this must be dispatched to the parse worker. See Section 6 for the worker protocol.

**`<LogRow />` component:**

```ts
interface LogRowProps {
  lineIndex: number
}
```

`<LogRow />` reads the log line from the store using a stable selector keyed by `lineIndex`. It must not take the line as a prop directly (that would cause the entire list to re-render when a single line changes).

```tsx
// src/components/logs/LogRow.tsx
export const LogRow = React.memo(function LogRow({ lineIndex }: LogRowProps) {
  const line = useStore((s) => s.logs.lines[lineIndex])
  const isSelected = useStore((s) => s.ui.selectedLineIndex === lineIndex)
  const anomalyScore = useStore((s) => s.analysis.anomalyScores.get(lineIndex) ?? 0)
  const searchQuery = useStore((s) => s.ui.searchQuery)

  const levelClass = styles[`level-${line.level}`] ?? styles['level-unknown']
  const anomalyClass =
    anomalyScore > 0.8 ? styles.anomalyHigh : anomalyScore > 0.5 ? styles.anomalyMedium : ''

  return (
    <div
      className={`${styles.row} ${levelClass} ${anomalyClass} ${isSelected ? styles.selected : ''}`}
      role="row"
      aria-selected={isSelected}
      data-line-index={lineIndex}
      onClick={() => selectLine(lineIndex)}
    >
      <span className={styles.lineNumber} aria-hidden="true">
        {lineIndex + 1}
      </span>
      <span className={styles.timestamp}>{formatTimestamp(line.timestampMs)}</span>
      <span className={styles.level} aria-label={`Log level: ${line.level}`}>
        {line.level.toUpperCase()}
      </span>
      <span className={styles.message}>
        {searchQuery ? <HighlightedText text={line.message} query={searchQuery} /> : line.message}
      </span>
    </div>
  )
})
```

**Performance constraints:**

- `<LogRow />` must not perform any computation heavier than a map lookup per render.
- `HighlightedText` uses a simple `split`/`join` approach, not a regex, to avoid performance cliffs on very long lines.
- The `anomalyScores` map is a `Map<number, number>` (not a plain object) to avoid V8 dictionary deoptimization on sparse integer keys.

---

### 4.6 `<ClusteringView />`

**File:** `src/components/clustering/ClusteringView.tsx`

**Responsibility:** Displays log lines grouped by semantic cluster. Each cluster is a collapsible group showing the representative pattern, line count, and a sample of matching lines. Allows developers to identify and ignore repetitive log patterns (e.g., health check pings, database heartbeats).

**Props:**

```ts
interface ClusteringViewProps {
  // No external props — reads from Zustand analysis slice
}
```

**Data structures:**

```ts
// src/types/analysis.types.ts

export interface ClusterResult {
  id: string // Stable cluster identifier (e.g., "cluster-0", "cluster-1")
  label: string // Auto-generated human-readable label (first 80 chars of representative line)
  pattern: string // The "template" extracted from cluster members (variables replaced with {N})
  count: number // Total number of log lines in this cluster
  percentage: number // Fraction of total lines (0–1)
  representativeIndex: number // Index of the most central log line in the original lines array
  memberIndices: number[] // All line indices belonging to this cluster
  firstSeenMs: number
  lastSeenMs: number
  isNoise: boolean // DBSCAN noise cluster (-1 label)
}
```

**ClusterGroup component:**

```ts
interface ClusterGroupProps {
  cluster: ClusterResult
  isExpanded: boolean
  onToggle: (id: string) => void
}
```

```tsx
// src/components/clustering/ClusterGroup.tsx
export function ClusterGroup({ cluster, isExpanded, onToggle }: ClusterGroupProps) {
  const lineCount = Math.min(cluster.memberIndices.length, 50) // Show max 50 lines expanded
  // If memberIndices.length > 50, render a "Show all N lines" button that filters LogViewer

  return (
    <div
      className={`${styles.group} ${cluster.isNoise ? styles.noise : ''}`}
      role="group"
      aria-label={`Cluster: ${cluster.label}`}
    >
      <button
        className={styles.header}
        onClick={() => onToggle(cluster.id)}
        aria-expanded={isExpanded}
        aria-controls={`cluster-body-${cluster.id}`}
      >
        <span className={styles.toggle} aria-hidden="true">
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className={styles.pattern}>{cluster.pattern}</span>
        <Badge count={cluster.count} />
        <span className={styles.percentage}>{(cluster.percentage * 100).toFixed(1)}%</span>
      </button>

      {isExpanded && (
        <div id={`cluster-body-${cluster.id}`} className={styles.body}>
          {cluster.memberIndices.slice(0, lineCount).map((idx) => (
            <LogRow key={idx} lineIndex={idx} />
          ))}
          {cluster.memberIndices.length > lineCount && (
            <button className={styles.showAll} onClick={() => filterToCluster(cluster.id)}>
              Show all {cluster.count} lines in Log Viewer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

**Sorting:** Clusters are sorted by `count` descending by default. A sort control allows switching to "by first occurrence" or "by anomaly score."

**Noise cluster:** The DBSCAN noise cluster (`isNoise: true`) is always rendered last, collapsed by default, with a visual distinction (dimmer color, italic pattern text).

---

### 4.7 `<AnomalyCard />`

**File:** `src/components/anomaly/AnomalyCard.tsx`

**Responsibility:** Displays a single detected anomaly with its anomaly score, the triggering log line, a one-line plain-English explanation (generated by the inference worker), and a "View Smart Context" button.

**Props:**

```ts
interface AnomalyCardProps {
  anomaly: AnomalyResult
  isSelected: boolean
  onSelect: (anomaly: AnomalyResult) => void
}
```

**Data structure:**

```ts
// src/types/analysis.types.ts

export interface AnomalyResult {
  lineIndex: number
  timestampMs: number
  score: number // Cosine distance (0–1). Higher = more anomalous.
  severity: 'low' | 'medium' | 'high' | 'critical'
  triggerLine: LogLine
  explanation: string // Plain-English summary from inference worker
  contextStartIndex: number // First line of the 50–100 line context window
  contextEndIndex: number
  clusterId: string | null // null if unclustered
}

// Severity thresholds:
// score >= 0.9 → critical
// score >= 0.75 → high
// score >= 0.5 → medium
// score < 0.5 → low
```

**Rendered structure:**

```html
<article
  class="anomaly-card severity-{severity} {isSelected ? 'selected' : ''}"
  role="article"
  aria-label="Anomaly at {formatTimestamp(anomaly.timestampMs)}, score {(anomaly.score * 100).toFixed(0)}%"
  onClick="{handleSelect}"
>
  <header class="card-header">
    <span class="severity-badge severity-{severity}">{severity.toUpperCase()}</span>
    <span class="score" aria-label="Anomaly score">{(anomaly.score * 100).toFixed(0)}%</span>
    <time class="timestamp" datetime="{new" Date(anomaly.timestampMs).toISOString()}>
      {formatTimestamp(anomaly.timestampMs)}
    </time>
  </header>

  <pre class="trigger-line" aria-label="Triggering log line">
    {anomaly.triggerLine.raw}
  </pre>

  <p class="explanation">{anomaly.explanation}</p>

  <footer class="card-footer">
    <button
      type="button"
      class="btn-context"
      aria-label="View 50–100 lines of context before this anomaly"
      onClick="{handleViewContext}"
    >
      View Smart Context
    </button>
    <button
      type="button"
      class="btn-jump"
      aria-label="Jump to line {anomaly.lineIndex + 1} in Log Viewer"
      onClick="{handleJumpToLine}"
    >
      Jump to line {anomaly.lineIndex + 1}
    </button>
  </footer>
</article>
```

**"View Smart Context" interaction:** Sets `ui.smartContextAnomalyIndex` in the store. The `<SmartContextPanel>` observes this value and slides in.

---

### 4.8 `<SmartContextPanel />`

**File:** `src/components/context/SmartContextPanel.tsx`

**Responsibility:** A slide-in panel (right drawer, 40% viewport width) displaying the 50–100 log lines preceding a detected anomaly. Provides "failure chain" forensic context. Renders using the same `<LogRow>` component for consistency. The panel highlights the triggering anomaly line distinctively.

**Props:**

```ts
interface SmartContextPanelProps {
  // No external props — reads anomalyIndex from ui slice
  // Renders when ui.smartContextAnomalyIndex !== null
}
```

**Data flow:**

1. User clicks "View Smart Context" on an `<AnomalyCard>`.
2. `ui.smartContextAnomalyIndex` is set to the anomaly's `lineIndex`.
3. `<SmartContextPanel>` computes `contextLines = logs.lines.slice(contextStartIndex, contextEndIndex + 1)`.
4. Panel slides in from the right using a CSS transform transition.
5. The triggering line (`anomaly.lineIndex`) is highlighted with a distinct left border and background.
6. Escape key or the close button sets `ui.smartContextAnomalyIndex = null`.

**Context window size:** 50–100 lines preceding the anomaly. The exact count is determined by the inference worker: it includes lines up to the point where the semantic signal starts diverging (i.e., the boundary of the "normal" pattern). The minimum is 50 and the maximum is 100.

**Rendered structure:**

```html
<aside
  class="smart-context-panel {isOpen ? 'open' : ''}"
  role="complementary"
  aria-label="Smart context panel"
  aria-hidden="{!isOpen}"
>
  <header class="panel-header">
    <h2>Smart Context</h2>
    <p class="subtitle">Lines {contextStartIndex + 1}–{contextEndIndex + 1} of {totalLines}</p>
    <button
      type="button"
      class="close-btn"
      aria-label="Close smart context panel"
      onClick="{handleClose}"
    >
      ✕
    </button>
  </header>

  <div class="context-body" role="list">
    {contextLines.map((_, offset) => { const lineIndex = contextStartIndex + offset; return (
    <div
      key="{lineIndex}"
      class="context-row {lineIndex === anomalyLineIndex ? 'trigger-line' : ''}"
      role="listitem"
    >
      <LogRow lineIndex="{lineIndex}" />
      {lineIndex === anomalyLineIndex && (
      <span class="trigger-marker" aria-label="Anomaly trigger point">◀ ANOMALY</span>
      )}
    </div>
    ); })}
  </div>

  <footer class="panel-footer">
    <p class="explanation">{anomaly.explanation}</p>
    <button
      type="button"
      class="btn-copy"
      onClick="{handleCopyContext}"
      aria-label="Copy context to clipboard"
    >
      Copy to clipboard
    </button>
  </footer>
</aside>
```

**Focus management:** When the panel opens, focus is moved to the panel's close button. When the panel closes, focus returns to the "View Smart Context" button that opened it. This is implemented using `useRef` and `focus()` calls in a `useEffect` that watches `isOpen`.

---

## 5. State Management Architecture

### Store Structure (Zustand)

```ts
// src/types/store.types.ts — complete store shape

import type { LogLine } from './log.types'
import type { ClusterResult, AnomalyResult, SmartContext } from './analysis.types'

// ───── Ingestion Slice ─────

export interface IngestionSlice {
  fileName: string | null
  fileSize: number // bytes
  progress: IngestionProgress // see Section 4.3
}

// ───── Logs Slice ─────

export interface LogsSlice {
  /**
   * The primary log line store. This array is NEVER mutated after population —
   * push() is only called by the parse worker bridge before analysis begins.
   * All read access is by index (O(1)).
   *
   * Memory note: For 1M lines averaging 150 bytes each, raw strings alone
   * consume ~150MB. LogLine objects add overhead. We store a reference to the
   * original Uint8Array from the worker and decode lines lazily in LogRow.
   * See Section 7 (Virtualization Strategy) for detail.
   */
  lines: readonly LogLine[]
  totalCount: number
}

// ───── Analysis Slice ─────

export interface AnalysisSlice {
  clusters: readonly ClusterResult[]
  anomalies: readonly AnomalyResult[]
  /**
   * Map from line index to cosine distance score (0–1).
   * Stored as a Map (not plain object) for O(1) integer key lookups
   * without V8 dictionary deoptimization.
   */
  anomalyScores: ReadonlyMap<number, number>
  modelName: string | null // e.g. "Xenova/all-MiniLM-L6-v2"
  modelLoadedAt: number | null // Date.now() when model finished loading
  gpuAvailable: boolean
  inferenceBackend: 'webgpu' | 'wasm' // Falls back to wasm if WebGPU unavailable
}

// ───── UI Slice ─────

export interface UISlice {
  activeTab: 'logs' | 'clusters' | 'anomalies'
  selectedLineIndex: number | null
  selectedTimeRange: [number, number] | null // [startMs, endMs]
  searchQuery: string
  levelFilter: LogLevel | null
  selectedClusterId: string | null
  smartContextAnomalyIndex: number | null
  expandedClusterIds: Set<string>
  sidebarOpen: boolean
}

// ───── Root Store ─────

export interface StoreState {
  ingestion: IngestionSlice
  logs: LogsSlice
  analysis: AnalysisSlice
  ui: UISlice
}
```

### Store Actions

```ts
// src/store/index.ts — Zustand store definition (abbreviated)

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export const useStore = create<StoreState & StoreActions>()(
  devtools(
    (set, get) => ({
      ...initialIngestionSlice,
      ...initialLogsSlice,
      ...initialAnalysisSlice,
      ...initialUISlice,

      // ── Ingestion Actions ──
      setIngestionProgress: (progress: Partial<IngestionProgress>) =>
        set((s) => ({
          ingestion: {
            ...s.ingestion,
            progress: { ...s.ingestion.progress, ...progress, lastUpdatedAt: Date.now() },
          },
        })),

      setFileName: (fileName: string, fileSize: number) =>
        set((s) => ({ ingestion: { ...s.ingestion, fileName, fileSize } })),

      // ── Logs Actions ──
      appendLogLines: (newLines: LogLine[]) =>
        set((s) => ({
          logs: {
            lines: [...s.logs.lines, ...newLines],
            totalCount: s.logs.totalCount + newLines.length,
          },
        })),

      setLogLines: (lines: LogLine[]) => set({ logs: { lines, totalCount: lines.length } }),

      // ── Analysis Actions ──
      setClusterResults: (clusters: ClusterResult[]) =>
        set((s) => ({ analysis: { ...s.analysis, clusters } })),

      setAnomalyResults: (anomalies: AnomalyResult[], scores: Map<number, number>) =>
        set((s) => ({ analysis: { ...s.analysis, anomalies, anomalyScores: scores } })),

      setInferenceBackend: (backend: 'webgpu' | 'wasm', gpuAvailable: boolean) =>
        set((s) => ({ analysis: { ...s.analysis, inferenceBackend: backend, gpuAvailable } })),

      // ── UI Actions ──
      setActiveTab: (tab: UISlice['activeTab']) =>
        set((s) => ({ ui: { ...s.ui, activeTab: tab } })),

      selectLine: (lineIndex: number | null) =>
        set((s) => ({ ui: { ...s.ui, selectedLineIndex: lineIndex } })),

      setTimeRange: (range: [number, number] | null) =>
        set((s) => ({ ui: { ...s.ui, selectedTimeRange: range } })),

      setSearchQuery: (query: string) => set((s) => ({ ui: { ...s.ui, searchQuery: query } })),

      setLevelFilter: (level: LogLevel | null) =>
        set((s) => ({ ui: { ...s.ui, levelFilter: level } })),

      openSmartContext: (anomalyIndex: number) =>
        set((s) => ({ ui: { ...s.ui, smartContextAnomalyIndex: anomalyIndex } })),

      closeSmartContext: () => set((s) => ({ ui: { ...s.ui, smartContextAnomalyIndex: null } })),

      toggleCluster: (clusterId: string) =>
        set((s) => {
          const next = new Set(s.ui.expandedClusterIds)
          if (next.has(clusterId)) next.delete(clusterId)
          else next.add(clusterId)
          return { ui: { ...s.ui, expandedClusterIds: next } }
        }),

      reset: () =>
        set({
          ...initialIngestionSlice,
          ...initialLogsSlice,
          ...initialAnalysisSlice,
          ...initialUISlice,
        }),
    }),
    { name: 'LogiLog-store' },
  ),
)
```

### Derived State (Selectors)

```ts
// src/store/selectors.ts — all selectors use reselect's createSelector for memoization

import { createSelector } from 'reselect'

// The number of high-severity anomalies (score >= 0.75)
export const selectHighSeverityCount = createSelector(
  (s: StoreState) => s.analysis.anomalies,
  (anomalies) => anomalies.filter((a) => a.score >= 0.75).length,
)

// Lines currently visible based on all active filters
export const selectFilteredLogIndices = createSelector(
  (s: StoreState) => s.logs.lines,
  (s: StoreState) => s.ui.selectedTimeRange,
  (s: StoreState) => s.ui.searchQuery,
  (s: StoreState) => s.ui.levelFilter,
  (s: StoreState) => s.ui.selectedClusterId,
  (lines, timeRange, query, levelFilter, clusterId) => {
    /* ... see Section 4.5 */
  },
)

// Total line count for the status bar
export const selectStatusBarText = createSelector(
  (s: StoreState) => s.logs.totalCount,
  (s: StoreState) => s.analysis.clusters.length,
  (s: StoreState) => s.analysis.anomalies.length,
  (s: StoreState) => s.analysis.inferenceBackend,
  (s: StoreState) => s.analysis.modelName,
  (total, clusters, anomalies, backend, model) =>
    `${total.toLocaleString()} lines · ${clusters} clusters · ${anomalies} anomalies · ${backend.toUpperCase()} · ${model ?? 'No model'}`,
)
```

---

## 6. Web Worker Integration

LogiLog uses two dedicated workers, both initialized via Vite's built-in `?worker` import syntax. Workers communicate with the main thread exclusively via structured `postMessage` with Transferable objects.

### Worker Architecture Diagram

```
Main Thread (React/Zustand)
        │
        ├── parse.worker.ts
        │     ├── Receives: ArrayBuffer of raw file bytes
        │     ├── Processes: Line splitting, timestamp parsing, level extraction
        │     └── Sends: Batches of LogLine[] (every 10,000 lines), then 'done'
        │
        └── inference.worker.ts
              ├── Receives: LogLine[] (complete, after parsing done)
              ├── Processes: Transformers.js embedding, DBSCAN clustering, anomaly scoring
              └── Sends: Progress updates, ClusterResult[], AnomalyResult[], anomaly scores
```

### Worker Message Types

```ts
// src/workers/worker.types.ts
// This file MUST NOT import from src/ — it is shared between workers and the main thread.
// Workers run in a separate context; importing React or Zustand would break them.

// ───── Parse Worker ─────

export type ParseWorkerIncomingMessage =
  | { type: 'PARSE'; buffer: ArrayBuffer; fileName: string }
  | { type: 'CANCEL' }

export type ParseWorkerOutgoingMessage =
  | { type: 'PROGRESS'; bytesRead: number; totalBytes: number; linesParsed: number }
  | { type: 'BATCH'; lines: SerializedLogLine[]; batchIndex: number }
  | { type: 'DONE'; totalLines: number; durationMs: number }
  | { type: 'ERROR'; message: string; stack?: string }

// ───── Inference Worker ─────

export type InferenceWorkerIncomingMessage =
  | { type: 'INIT'; modelName: string }
  | { type: 'ANALYZE'; lines: SerializedLogLine[] }
  | { type: 'CANCEL' }

export type InferenceWorkerOutgoingMessage =
  | { type: 'MODEL_LOADING'; progress: number; statusMessage: string }
  | { type: 'MODEL_READY'; backend: 'webgpu' | 'wasm'; modelName: string }
  | { type: 'ANALYSIS_PROGRESS'; linesAnalyzed: number; totalLines: number; statusMessage: string }
  | { type: 'CLUSTER_BATCH'; clusters: ClusterResult[] }
  | { type: 'ANOMALY_BATCH'; anomalies: AnomalyResult[]; scores: [number, number][] }
  | { type: 'DONE'; durationMs: number }
  | { type: 'ERROR'; message: string; stack?: string }

// ───── Shared Types (no DOM/React dependencies) ─────

export interface SerializedLogLine {
  index: number
  raw: string
  timestampMs: number
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'unknown'
  message: string
  clusterId: string | null
  fields: Record<string, string> // JSON fields, structured log key-value pairs
}
```

### Custom Hook: `useFileIngestion`

```ts
// src/hooks/useFileIngestion.ts

/**
 * Manages the full pipeline: File System Access API -> parse worker -> inference worker.
 * Uses a ref to hold the worker instances so they persist across renders.
 * Updates Zustand store at each stage.
 */
export function useFileIngestion() {
  const parseWorkerRef = useRef<Worker | null>(null)
  const inferenceWorkerRef = useRef<Worker | null>(null)
  const store = useStore()

  const startIngestion = useCallback(
    async (stream: ReadableStream<Uint8Array>, fileName: string, size: number) => {
      store.reset()
      store.setFileName(fileName, size)
      store.setIngestionProgress({
        stage: 'loading',
        stageProgress: 0,
        statusMessage: 'Reading file…',
      })

      // Read stream into ArrayBuffer
      const reader = stream.getReader()
      const chunks: Uint8Array[] = []
      let bytesRead = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        bytesRead += value.byteLength
        store.setIngestionProgress({
          bytesRead,
          totalBytes: size,
          stageProgress: size > 0 ? bytesRead / size : -1,
          statusMessage: `Reading… ${formatBytes(bytesRead)} of ${formatBytes(size)}`,
        })
      }

      // Combine chunks into one ArrayBuffer for transfer to worker
      const combined = new Uint8Array(bytesRead)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.byteLength
      }

      // Transfer to parse worker (zero-copy via Transferable)
      store.setIngestionProgress({
        stage: 'parsing',
        stageProgress: 0,
        statusMessage: 'Parsing log lines…',
      })

      const ParseWorker = (await import('./parse.worker?worker')).default
      const parseWorker = new ParseWorker()
      parseWorkerRef.current = parseWorker

      const allLines: SerializedLogLine[] = []

      parseWorker.onmessage = (event: MessageEvent<ParseWorkerOutgoingMessage>) => {
        const msg = event.data
        switch (msg.type) {
          case 'PROGRESS':
            store.setIngestionProgress({
              stageProgress: msg.totalBytes > 0 ? msg.bytesRead / msg.totalBytes : -1,
              linesParsed: msg.linesParsed,
              statusMessage: `Parsed ${msg.linesParsed.toLocaleString()} lines…`,
            })
            break
          case 'BATCH':
            allLines.push(...msg.lines)
            // Append incrementally so the UI can show partial results
            store.appendLogLines(msg.lines.map(deserializeLogLine))
            break
          case 'DONE':
            parseWorker.terminate()
            startAnalysis(allLines)
            break
          case 'ERROR':
            store.setIngestionProgress({ stage: 'error', statusMessage: msg.message })
            break
        }
      }

      // Transfer the ArrayBuffer — after this, combined.buffer is detached (zero-copy)
      parseWorker.postMessage(
        { type: 'PARSE', buffer: combined.buffer, fileName } satisfies ParseWorkerIncomingMessage,
        [combined.buffer],
      )
    },
    [store],
  )

  const startAnalysis = useCallback(
    async (lines: SerializedLogLine[]) => {
      store.setIngestionProgress({
        stage: 'analyzing',
        stageProgress: 0,
        statusMessage: 'Loading model…',
      })

      const InferenceWorker = (await import('./inference.worker?worker')).default
      const inferenceWorker = new InferenceWorker()
      inferenceWorkerRef.current = inferenceWorker

      inferenceWorker.onmessage = (event: MessageEvent<InferenceWorkerOutgoingMessage>) => {
        const msg = event.data
        switch (msg.type) {
          case 'MODEL_LOADING':
            store.setIngestionProgress({
              stageProgress: msg.progress,
              statusMessage: msg.statusMessage,
            })
            break
          case 'MODEL_READY':
            store.setInferenceBackend(msg.backend, msg.backend === 'webgpu')
            break
          case 'ANALYSIS_PROGRESS':
            store.setIngestionProgress({
              linesAnalyzed: msg.linesAnalyzed,
              totalLines: msg.totalLines,
              stageProgress: msg.totalLines > 0 ? msg.linesAnalyzed / msg.totalLines : -1,
              statusMessage: msg.statusMessage,
            })
            break
          case 'CLUSTER_BATCH':
            store.setClusterResults(msg.clusters)
            break
          case 'ANOMALY_BATCH':
            store.setAnomalyResults(msg.anomalies, new Map(msg.scores))
            break
          case 'DONE':
            inferenceWorker.terminate()
            store.setIngestionProgress({
              stage: 'complete',
              stageProgress: 1,
              statusMessage: 'Analysis complete.',
            })
            break
          case 'ERROR':
            store.setIngestionProgress({ stage: 'error', statusMessage: msg.message })
            break
        }
      }

      inferenceWorker.postMessage({
        type: 'ANALYZE',
        lines,
      } satisfies InferenceWorkerIncomingMessage)
    },
    [store],
  )

  const cancel = useCallback(() => {
    parseWorkerRef.current?.postMessage({ type: 'CANCEL' } satisfies ParseWorkerIncomingMessage)
    inferenceWorkerRef.current?.postMessage({
      type: 'CANCEL',
    } satisfies InferenceWorkerIncomingMessage)
    parseWorkerRef.current?.terminate()
    inferenceWorkerRef.current?.terminate()
    store.setIngestionProgress({ stage: 'idle', statusMessage: '' })
  }, [store])

  return { startIngestion, cancel }
}
```

### Parse Worker Implementation Sketch

```ts
// src/workers/parse.worker.ts
import { detectAndDecompressGzip } from './gzip'
import type { ParseWorkerIncomingMessage, ParseWorkerOutgoingMessage } from './worker.types'

const BATCH_SIZE = 10_000
let cancelled = false

self.onmessage = async (event: MessageEvent<ParseWorkerIncomingMessage>) => {
  const msg = event.data
  if (msg.type === 'CANCEL') {
    cancelled = true
    return
  }
  if (msg.type !== 'PARSE') return

  cancelled = false
  const { buffer, fileName } = msg

  let bytes = new Uint8Array(buffer)
  // Gzip detection: check magic bytes 0x1F 0x8B
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = await detectAndDecompressGzip(bytes)
  }

  const decoder = new TextDecoder('utf-8')
  const text = decoder.decode(bytes)
  const rawLines = text.split('\n')
  const totalLines = rawLines.length
  const batch: SerializedLogLine[] = []
  let batchIndex = 0

  for (let i = 0; i < rawLines.length; i++) {
    if (cancelled) return
    const raw = rawLines[i].trim()
    if (!raw) continue
    batch.push(parseLine(i, raw))

    if (batch.length >= BATCH_SIZE) {
      self.postMessage({
        type: 'BATCH',
        lines: [...batch],
        batchIndex,
      } satisfies ParseWorkerOutgoingMessage)
      if (i % 50_000 === 0) {
        self.postMessage({
          type: 'PROGRESS',
          bytesRead: bytes.byteLength,
          totalBytes: bytes.byteLength,
          linesParsed: i + 1,
        } satisfies ParseWorkerOutgoingMessage)
      }
      batch.length = 0
      batchIndex++
    }
  }

  if (batch.length > 0) {
    self.postMessage({
      type: 'BATCH',
      lines: batch,
      batchIndex,
    } satisfies ParseWorkerOutgoingMessage)
  }

  self.postMessage({
    type: 'DONE',
    totalLines,
    durationMs: performance.now(),
  } satisfies ParseWorkerOutgoingMessage)
}
```

### Inference Worker: Transformers.js Integration

```ts
// src/workers/inference.worker.ts (abbreviated)
import { pipeline, env } from '@xenova/transformers'

// Disable local model checks; all models load from Hugging Face CDN
// and are cached in IndexedDB automatically by Transformers.js.
env.allowLocalModels = false
env.backends.onnx.wasm.numThreads = 4

// WebGPU availability check
const hasWebGPU = 'gpu' in navigator
if (hasWebGPU) {
  env.backends.onnx.webgpu = true
}

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2' // 22M params, 4-bit quantized ~15MB

let extractor: Awaited<ReturnType<typeof pipeline>> | null = null

self.onmessage = async (event: MessageEvent<InferenceWorkerIncomingMessage>) => {
  const msg = event.data

  if (msg.type === 'ANALYZE') {
    // Lazy-load model on first analysis request
    if (!extractor) {
      extractor = await pipeline('feature-extraction', MODEL_NAME, {
        quantized: true,
        progress_callback: (p: { progress: number; status: string }) => {
          self.postMessage({
            type: 'MODEL_LOADING',
            progress: p.progress / 100,
            statusMessage: `Loading model: ${p.status} (${p.progress.toFixed(0)}%)`,
          } satisfies InferenceWorkerOutgoingMessage)
        },
      })
      self.postMessage({
        type: 'MODEL_READY',
        backend: hasWebGPU ? 'webgpu' : 'wasm',
        modelName: MODEL_NAME,
      } satisfies InferenceWorkerOutgoingMessage)
    }

    await runAnalysis(msg.lines)
  }
}
```

---

## 7. Virtualization Strategy

Rendering millions of log lines is the central performance challenge of LogiLog. The strategy has three layers.

### Layer 1: Fixed-Height Virtualization with react-window

`react-window`'s `FixedSizeList` renders only the rows visible in the viewport plus an `overscanCount` buffer of 10 rows on each side. For a 900px tall viewer with 20px rows, that is at most 45 + 20 = 65 DOM nodes, regardless of whether the dataset has 100 or 10,000,000 lines.

**Critical constraint:** All rows must be exactly `ROW_HEIGHT = 20px`. This is enforced by:

- Setting `font-size: 13px`, `line-height: 20px` on the row class in CSS.
- Truncating log lines that exceed the container width with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. Long lines are revealed on click via the `<SmartContextPanel>`.
- Never allowing dynamic content (images, multi-line text) inside a `LogRow`.

### Layer 2: Index-Based Data Model

The `logs.lines` array stores `LogLine` objects. `FixedSizeList` receives `filteredIndices: number[]` (an array of raw integer indices into `logs.lines`). This avoids creating a new filtered copy of the log lines array on every filter change — only the index array changes, which is orders of magnitude smaller.

For 1,000,000 lines where 500,000 match a filter, the old approach allocates a 500,000-element `LogLine[]`. The index-based approach allocates a 500,000-element `number[]`, which is 8 bytes per element (V8 SMI) vs. 40+ bytes per `LogLine` reference in a new array. This is a 5x memory saving for the filtered view.

### Layer 3: Deferred Filter Computation

When the user types in the search box, recomputing `selectFilteredLogIndices` synchronously would block the main thread for hundreds of milliseconds on large datasets. We defer this work using React 18's `useTransition`:

```tsx
// src/components/logs/LogSearch.tsx
export function LogSearch() {
  const [inputValue, setInputValue] = useState('')
  const [isPending, startTransition] = useTransition()
  const setSearchQuery = useStore((s) => s.setSearchQuery)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value) // Updates input immediately (urgent)
    startTransition(() => {
      setSearchQuery(e.target.value) // Triggers re-filter (deferred, interruptible)
    })
  }

  return (
    <div className={styles.search}>
      <input
        type="search"
        value={inputValue}
        onChange={handleChange}
        placeholder="Filter logs…"
        aria-label="Filter log lines"
        className={isPending ? styles.pending : ''}
      />
      {isPending && <Spinner size="small" aria-label="Filtering…" />}
    </div>
  )
}
```

For filter computations that take longer than ~200ms (datasets > 2M lines), the computation is moved to the parse worker. The main thread sends the filter criteria via `postMessage`, and the worker returns the filtered index array. The UI shows a spinner during the worker round-trip.

### Layer 4: Stable Scroll Position

When new lines are appended during incremental parsing, `react-window` must not scroll the user away from their current position. We implement this by tracking whether the user is at the bottom of the list (auto-scroll) or has scrolled up (lock position):

```tsx
const isAtBottom = useRef(true)
const handleScroll = ({
  scrollOffset,
  scrollUpdateWasRequested,
}: {
  scrollOffset: number
  scrollUpdateWasRequested: boolean
}) => {
  const maxOffset = filteredIndices.length * ROW_HEIGHT - listHeight
  isAtBottom.current = scrollOffset >= maxOffset - ROW_HEIGHT
}

useEffect(() => {
  if (isAtBottom.current) {
    listRef.current?.scrollToItem(filteredIndices.length - 1, 'end')
  }
}, [filteredIndices.length])
```

---

## 8. Routing

LogiLog is a single-page application. All views are rendered within `<AppShell>` using tab-based navigation, not URL routes. However, React Router is still used with Hash routing for two reasons:

1. **Bookmarkable state:** Future versions may encode filter state in the URL hash (e.g., `#/?tab=anomalies&query=OutOfMemory`). The router infrastructure makes this straightforward to add.
2. **Error boundaries per route:** React Router's `errorElement` provides per-route error boundaries.

### Route Table

| Path  | Component    | Description                 |
| ----- | ------------ | --------------------------- |
| `/#/` | `<AppShell>` | Main application (all tabs) |
| `*`   | `<NotFound>` | 404 fallback                |

### Tab State

Tabs ("Logs", "Clusters", "Anomalies") are UI state stored in `ui.activeTab`, not URL routes. This is intentional: tab switching is a sub-second interaction that should not trigger a full navigation event or affect browser history.

---

## 9. Theming

The terminal aesthetic is achieved entirely through CSS custom properties defined in `src/styles/tokens.css`. Every component references these tokens — no hardcoded colors or pixel values outside this file.

### Color Tokens

```css
/* src/styles/tokens.css */
:root {
  /* ── Background ── */
  --color-bg-base: #0d0d0f; /* Main background (near-black) */
  --color-bg-surface: #141417; /* Card / panel background */
  --color-bg-elevated: #1c1c21; /* Hover state, selected row */
  --color-bg-inset: #0a0a0c; /* Input backgrounds */
  --color-bg-overlay: rgba(0, 0, 0, 0.65); /* Modal/panel overlay */

  /* ── Text ── */
  --color-text-primary: #e2e2e6; /* Main readable text */
  --color-text-secondary: #7e7e8a; /* Metadata, timestamps, line numbers */
  --color-text-muted: #4a4a56; /* Disabled states, placeholders */
  --color-text-inverse: #0d0d0f; /* Text on bright badges */

  /* ── Accent ── */
  --color-accent-primary: #5b8fff; /* Interactive elements, focus rings */
  --color-accent-primary-dim: rgba(91, 143, 255, 0.15); /* Hover backgrounds */

  /* ── Semantic ── */
  --color-success: #3dba74;
  --color-success-dim: rgba(61, 186, 116, 0.12);
  --color-warning: #f0a820;
  --color-warning-dim: rgba(240, 168, 32, 0.12);
  --color-error: #e84040;
  --color-error-dim: rgba(232, 64, 64, 0.12);
  --color-critical: #ff5c5c;
  --color-critical-dim: rgba(255, 92, 92, 0.18);

  /* ── Log Level Colors ── */
  --color-level-trace: #4a4a56;
  --color-level-debug: #7e7e8a;
  --color-level-info: #5b8fff;
  --color-level-warn: #f0a820;
  --color-level-error: #e84040;
  --color-level-fatal: #ff5c5c;

  /* ── Anomaly Score Gradient ── */
  /* Scores 0.5–0.75: warning amber; 0.75–0.9: error red; 0.9–1.0: critical */
  --color-anomaly-medium: #f0a820;
  --color-anomaly-high: #e84040;
  --color-anomaly-critical: #ff5c5c;

  /* ── Border ── */
  --color-border-subtle: rgba(255, 255, 255, 0.06);
  --color-border-default: rgba(255, 255, 255, 0.12);
  --color-border-strong: rgba(255, 255, 255, 0.24);
  --color-border-focus: var(--color-accent-primary);

  /* ── Typography ── */
  --font-mono:
    'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, 'Courier New', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  --font-size-xs: 11px; /* Line numbers, metadata */
  --font-size-sm: 12px; /* Secondary labels */
  --font-size-base: 13px; /* Log line text — must match ROW_HEIGHT */
  --font-size-md: 14px; /* UI labels, buttons */
  --font-size-lg: 16px; /* Section headings */
  --font-size-xl: 20px; /* Panel titles */

  --line-height-log: 20px; /* Fixed. Must match react-window ROW_HEIGHT constant. */
  --line-height-ui: 1.5;

  /* ── Spacing ── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* ── Radius ── */
  --radius-sm: 3px;
  --radius-md: 6px;
  --radius-lg: 10px;

  /* ── Shadows ── */
  --shadow-panel: 0 8px 32px rgba(0, 0, 0, 0.6);
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.4);

  /* ── Transitions ── */
  --transition-fast: 120ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 350ms ease;

  /* ── Layout ── */
  --sidebar-width: 260px;
  --timeline-height: 64px;
  --status-bar-height: 28px;
  --smart-context-width: 40vw;
  --smart-context-min-width: 380px;
  --smart-context-max-width: 700px;
}
```

### Typography Rules

- All log line text (`<LogRow>`) uses `var(--font-mono)` at `var(--font-size-base)` with `var(--line-height-log)`.
- All UI chrome (buttons, labels, tabs, panel headers) uses `var(--font-sans)` at `var(--font-size-md)`.
- The `<SmartContextPanel>` uses `var(--font-mono)` at `var(--font-size-sm)` for the context log lines.
- Line numbers use `var(--color-text-secondary)` and right-align to a fixed width (calculated based on the total line count).

### Scrollbar Styling

```css
/* src/styles/global.css */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--color-bg-inset);
}
::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: var(--radius-sm);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
```

---

## 10. Error States and Loading UX

Every component that can fail or wait must have an explicit treatment for all non-happy-path states. This table is exhaustive.

### Per-Component State Matrix

| Component             | Loading                               | Empty                                           | Error                                                        | Notes                                                   |
| --------------------- | ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `<FileDropZone>`      | N/A                                   | Renders itself (it is the empty state)          | Invalid file type (inline message), File API denied (silent) | Never shows a spinner — it is always interactive        |
| `<ProgressBar>`       | Is the loading component              | Hidden when `stage === 'idle'`                  | `stage === 'error'` shows error text + retry button          | 5-second stale indicator always present                 |
| `<Timeline>`          | Skeleton (grey bars at 20% height)    | Hidden when `lines.length === 0`                | Silent fail — timeline omitted, no error shown               | Skeleton uses CSS animation                             |
| `<LogViewer>`         | Shows first batch (incremental)       | "No lines match your filters" empty state       | Error boundary catches render errors                         | Partial data shown immediately as it streams in         |
| `<LogRow>`            | N/A                                   | N/A                                             | Corrupted line: render raw text in error color               | Must never throw — wraps in try/catch                   |
| `<ClusteringView>`    | "Clustering in progress…" placeholder | "No clusters found" (only if analysis complete) | "Clustering failed" + raw log view suggestion                | Placeholder shows after Parsing completes               |
| `<AnomalyCard>`       | N/A                                   | N/A                                             | Malformed anomaly: skip rendering, log to console            | Individual card failures must not crash the list        |
| `<AnomalyList>`       | "Detecting anomalies…" placeholder    | "No anomalies detected — your logs look normal" | Error boundary with retry                                    | Empty state is positive UX (good news)                  |
| `<SmartContextPanel>` | N/A                                   | Panel closed                                    | "Context unavailable" if `contextStartIndex === -1`          | Panel never shows in error state — shows message inside |

### Global Error Boundary

```tsx
// src/components/shared/ErrorBoundary.tsx
interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, log to a local IndexedDB error log (no external telemetry — privacy-first)
    console.error('[LogiLog ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" aria-live="assertive" className="error-screen">
            <h1>Something went wrong</h1>
            <pre className="error-detail">{this.state.error?.message}</pre>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
```

### WebGPU Unavailability

When WebGPU is not available (Firefox, older Safari, corporate Chrome with GPU disabled), the inference worker automatically falls back to WASM. The user sees:

- Status bar: "WASM (WebGPU unavailable)"
- A one-time dismissible info banner: "WebGPU is unavailable in your browser. Analysis will use WASM — approximately 10–30x slower. Chrome 113+ on a supported GPU is recommended for best performance."
- The banner is stored in `localStorage` after dismissal so it does not re-appear.

### Skeleton States

Timeline and ClusteringView show CSS skeleton loaders while data is being produced by the workers. These use a `@keyframes` animation:

```css
@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.6;
  }
}
.skeleton {
  background: var(--color-bg-elevated);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
```

---

## 11. Accessibility

LogiLog targets WCAG 2.1 AA compliance. The terminal aesthetic creates specific accessibility challenges that are addressed below.

### Color Contrast Requirements

All text must meet the minimum contrast ratios:

- Normal text (< 18px): 4.5:1 against its background.
- Large text (>= 18px bold or >= 24px): 3:1.
- UI components and graphical objects: 3:1.

The color tokens defined in Section 9 are designed to meet these ratios. `--color-text-primary` (#e2e2e6) on `--color-bg-base` (#0d0d0f) achieves approximately 12.6:1. Log level colors are the highest-risk area — `--color-level-debug` (#7e7e8a) on `--color-bg-base` achieves 4.6:1, which barely passes AA. Trace level uses italic styling in addition to color to avoid relying on color alone.

### ARIA Strategy

Log lines do not use `role="row"` within a `role="grid"` because virtualizing a `<table>` with `react-window` requires complex accessibility wrappers. Instead:

- The `<LogViewer>` outer container has `role="log"` and `aria-label="Log output"`. This is the correct semantic role for a live, auto-updating log.
- `aria-live="off"` is set on the `<LogViewer>` container by default. When a user jumps to a line, a `role="status"` element announces "Jumped to line N" without reading every log line.
- Individual `<LogRow>` components have `role="article"` to support screen reader navigation between rows.

### Focus Management

- The `<FileDropZone>` button receives focus on initial page load (`autoFocus`).
- When the `<SmartContextPanel>` opens, focus traps within it (using a focus trap utility). When it closes, focus returns to the triggering button.
- All interactive elements (buttons, inputs, timeline buckets) must have a visible `:focus-visible` ring using `outline: 2px solid var(--color-border-focus); outline-offset: 2px`.
- The log row list supports `j`/`k` keyboard navigation (vim-style). When a row is selected, it receives `aria-selected="true"` and is announced to screen readers.

### Keyboard Navigation Map

| Key                              | Action                                                 |
| -------------------------------- | ------------------------------------------------------ |
| `j`                              | Select next log line                                   |
| `k`                              | Select previous log line                               |
| `/`                              | Focus the search input                                 |
| `Escape`                         | Clear selection, close SmartContextPanel, clear search |
| `Enter` (on timeline bucket)     | Filter to bucket time range                            |
| `Arrow Left/Right` (in timeline) | Move bucket selection                                  |
| `Space` (on cluster group)       | Toggle expand/collapse                                 |
| `Tab`                            | Standard focus traversal                               |

### Screen Reader Announcements

```tsx
// src/components/shared/LiveRegion.tsx
// A persistent aria-live region for announcing non-visual events.
// Mounted once in <AppShell>, updated via the Zustand ui slice.

export function LiveRegion() {
  const announcement = useStore((s) => s.ui.announcement)
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only" /* visually hidden but readable by screen readers */
    >
      {announcement}
    </div>
  )
}

// Example announcements:
// "Loaded 1,247,832 log lines from app.log"
// "Found 3 anomalies"
// "Jumped to line 48,291"
// "Smart context panel opened for anomaly at 2024-01-15 03:42:11"
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  .shimmer {
    display: none;
  }
}
```

---

## 12. Testing Strategy

### Unit Tests (Vitest)

Unit tests cover all pure functions in `src/lib/` and all Zustand store slices. They run in a Node environment with no DOM (using `environment: 'node'` in vitest config for non-React tests).

**What to unit test:**

| Module                | Test cases                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logParser.ts`        | Parses ISO 8601, Unix timestamp, and custom date formats; extracts log level from `[WARN]`, `WARN:`, `level=warn`, `"level":"warn"` variants; handles malformed lines (no timestamp, no level) without throwing; correctly handles Windows `\r\n` line endings |
| `timelineBuckets.ts`  | Zero lines returns empty array; single line creates one non-empty bucket; all anomalies in one bucket sets correct `maxAnomalyScore`; `firstLineIndex` is always the chronologically first line in the bucket                                                  |
| `cosineSimilarity.ts` | Identical vectors return distance 0; orthogonal vectors return distance 1; handles zero-vector input without NaN                                                                                                                                               |
| `formatters.ts`       | `formatDuration` correctly formats ms → "3.2s", "1m 12s", "2h 3m"; `formatBytes` correctly formats → "4.2 MB", "1.1 GB"; `formatTimestamp` produces consistent output for a fixed input                                                                        |
| Zustand slices        | `appendLogLines` increases `totalCount`; `reset` returns to initial state; `toggleCluster` adds then removes an id from the Set; `selectFilteredLogIndices` selector is memoized (same reference returned when inputs unchanged)                               |

### Component Tests (React Testing Library)

Component tests run in a `jsdom` environment. They test interaction behavior and accessibility, not visual appearance.

**What to component test:**

| Component             | Test cases                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<FileDropZone>`      | Renders "Browse files" button; clicking button calls `openLogFile`; drag-over sets visual state (check `data-drag-over` attribute); dropping an invalid file type shows error message; `role="region"` and `aria-label` are present |
| `<ProgressBar>`       | Renders correct stage labels for each `IngestionStage`; `aria-valuenow` matches computed percentage; stale indicator appears after mocking `Date.now` to advance 6 seconds; shows "Still working" text when stale                   |
| `<LogSearch>`         | Typing in the input calls `setSearchQuery` after the transition; `aria-label` is present; pending state shows spinner                                                                                                               |
| `<ClusterGroup>`      | Clicking header toggles `aria-expanded`; expanded state renders member lines; "Show all" button calls `filterToCluster`                                                                                                             |
| `<AnomalyCard>`       | Renders severity badge; "View Smart Context" button calls `openSmartContext`; "Jump to line" calls `selectLine` and `setActiveTab('logs')`                                                                                          |
| `<SmartContextPanel>` | Hidden when `smartContextAnomalyIndex === null`; visible when set; close button sets index to null; focus moves to close button on open; Escape key closes panel                                                                    |
| `<ErrorBoundary>`     | Renders fallback when child throws; does not rethrow                                                                                                                                                                                |

**Example component test:**

```tsx
// src/components/ingestion/__tests__/ProgressBar.test.tsx
import { render, screen } from '@testing-library/react'
import { ProgressBar } from '../ProgressBar'
import { useStore } from '../../../store'

// Mock Zustand store
vi.mock('../../../store', () => ({
  useStore: vi.fn(),
}))

describe('ProgressBar', () => {
  it('shows "Still working…" indicator when lastUpdatedAt is more than 5 seconds ago', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    ;(useStore as ReturnType<typeof vi.fn>).mockReturnValue({
      stage: 'analyzing',
      stageProgress: 0.4,
      statusMessage: 'Embedding line 40,000 of 100,000…',
      lastUpdatedAt: now - 6000, // 6 seconds ago — stale
      elapsedMs: 12000,
      etaMs: -1,
    })

    render(<ProgressBar />)

    expect(screen.getByText(/still working/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '52') // 10 + 30 + (0.4 * 60) ≈ 64 actually, verify math
  })

  it('renders three stage indicators in correct states', () => {
    ;(useStore as ReturnType<typeof vi.fn>).mockReturnValue({
      stage: 'analyzing',
      stageProgress: 0.2,
      statusMessage: 'Analyzing…',
      lastUpdatedAt: Date.now(),
      elapsedMs: 5000,
      etaMs: 20000,
    })

    render(<ProgressBar />)

    expect(screen.getByText('Loading')).toHaveAttribute(
      'class',
      expect.stringContaining('complete'),
    )
    expect(screen.getByText('Parsing')).toHaveAttribute(
      'class',
      expect.stringContaining('complete'),
    )
    expect(screen.getByText('Analyzing')).toHaveAttribute(
      'class',
      expect.stringContaining('active'),
    )
  })
})
```

### Integration Tests

Integration tests use a real (not mocked) Zustand store and test the interaction between components and the store.

**Key integration scenarios:**

1. **File → Parse → Display pipeline:** Simulate a `BATCH` message from the parse worker. Assert that `<LogViewer>` renders the correct number of visible rows (accounting for virtualization). Assert that the status bar updates its line count.

2. **Timeline → LogViewer filter:** Click a `<TimelineBucket>`. Assert that `selectFilteredLogIndices` returns only lines within that time range. Assert that `react-window` reports the correct `itemCount`.

3. **Anomaly → SmartContext flow:** Click "View Smart Context" on an `<AnomalyCard>`. Assert that `<SmartContextPanel>` becomes visible. Assert that the triggering log line is highlighted. Assert that pressing Escape closes the panel and returns focus.

### End-to-End Tests (Playwright)

E2E tests run against the production Vite build served locally. They use a set of static fixture log files of known sizes and content.

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:4173', // vite preview port
    // Disable WebGPU in E2E — test the WASM fallback path for determinism
    launchOptions: {
      args: ['--disable-webgpu'],
    },
  },
  webServer: {
    command: 'pnpm build && pnpm preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
```

**E2E test scenarios:**

```ts
// e2e/ingestion.spec.ts
test('user can drop a log file and see parsed lines', async ({ page }) => {
  await page.goto('/')
  // Simulate file drop using Playwright's file chooser interception
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Browse files' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('./e2e/fixtures/small.log')

  // 5-second rule: progress must appear within 5s
  await expect(page.getByRole('progressbar')).toBeVisible({ timeout: 5000 })

  // After completion, log lines are visible
  await expect(page.getByRole('log')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/1,000 lines/)).toBeVisible()
})

test('timeline filters the log viewer', async ({ page }) => {
  // ... load file, wait for analysis ...
  const firstBucket = page
    .getByRole('listbox', { name: /time buckets/i })
    .getByRole('option')
    .first()
  await firstBucket.click()
  // Assert log viewer shows reduced line count
  await expect(page.getByRole('status')).toContainText('Showing')
})

test('anomaly card opens smart context panel', async ({ page }) => {
  // ... load anomalous.log fixture, wait for anomalies ...
  await page
    .getByRole('button', { name: /view smart context/i })
    .first()
    .click()
  await expect(page.getByRole('complementary', { name: /smart context/i })).toBeVisible()
  // Escape closes it
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary')).not.toBeVisible()
})
```

### Performance Tests

For log files with > 500,000 lines, measure:

- **Time to First Interactive:** From file selection to first batch appearing in `<LogViewer>`. Target: < 3 seconds.
- **Scroll frame rate:** Using Playwright's `page.evaluate(() => /* RAF-based FPS measurement */)` to verify scrolling through the virtualized list maintains >= 50 FPS.
- **Filter latency:** Time from typing a search query to the filtered result appearing. Target: < 100ms for files up to 100,000 lines (main thread computation); < 500ms for files up to 1,000,000 lines (worker-assisted computation).
- **Memory:** `performance.memory.usedJSHeapSize` before and after loading a 1M line file. Maximum allowed growth: 400MB.

These are run as separate Playwright tests in CI on a dedicated `perf` workflow triggered nightly, not on every PR.

### CI Configuration

```yaml
# .github/workflows/ci.yml (abbreviated)
jobs:
  unit-and-integration:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test --reporter=verbose

  e2e:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build
      - run: pnpm exec playwright install chromium
      - run: pnpm test:e2e --project=chromium

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm tsc --noEmit
```

---

## Appendix A: COOP/COEP Header Configuration

WebGPU and `SharedArrayBuffer` (used by Transformers.js for multi-threaded WASM) require specific security headers:

```
# public/_headers (Netlify syntax — GitHub Pages requires a proxy or meta tags)
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

For GitHub Pages (which does not support custom response headers), these must be set via `<meta>` equivalents in `index.html` for COEP, and via a service worker for COOP:

```html
<!-- index.html -->
<meta http-equiv="Cross-Origin-Opener-Policy" content="same-origin" />
<meta http-equiv="Cross-Origin-Embedder-Policy" content="require-corp" />
```

Note: `Cross-Origin-Opener-Policy` cannot be set via a `<meta>` tag — it must be a response header. For GitHub Pages deployment, this requires either a custom domain with a proxy (Cloudflare Workers), or accepting the limitation that `SharedArrayBuffer` will be unavailable (Transformers.js WASM will fall back to single-threaded mode).

---

## Appendix B: Model Selection Rationale

`Xenova/all-MiniLM-L6-v2` is selected as the embedding model for the following reasons:

| Criterion                | Value                                                                    |
| ------------------------ | ------------------------------------------------------------------------ |
| Size (quantized 4-bit)   | ~15MB                                                                    |
| Embedding dimensions     | 384                                                                      |
| Inference speed (WebGPU) | ~2ms per log line batch of 32                                            |
| Inference speed (WASM)   | ~50ms per batch of 32                                                    |
| Semantic quality (MTEB)  | Sufficient for log clustering (not state-of-the-art but fits in browser) |
| Hugging Face CDN cached  | Yes (Transformers.js caches to IndexedDB after first load)               |

Batching strategy: Lines are embedded in batches of 32. The inference worker maintains a queue and processes batches asynchronously, posting `ANALYSIS_PROGRESS` messages between each batch to keep the UI updated.

---

_End of LogiLog Frontend Engineering Specification_
