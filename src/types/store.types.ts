import type { LogEntry } from './log.types'
import type { AnomalyResult, ClusterResult, SmartContext } from './analysis.types'

// Ingestion slice state
export interface IngestionState {
  status: 'idle' | 'loading' | 'parsing' | 'done' | 'error'
  fileName: string | null
  fileSizeBytes: number | null
  totalLines: number | null
  parsedLines: number
  progress: number // 0–1
  error: string | null
}

// Logs slice state
export interface LogsState {
  entries: LogEntry[]
  filteredIds: number[] | null
}

// Analysis slice state
export type AnalysisStatus = 'idle' | 'embedding' | 'analyzing' | 'done' | 'error'

export interface AnalysisState {
  anomalies: AnomalyResult[]
  clusters: ClusterResult[]
  smartContexts: Record<number, SmartContext>
  analysisStatus: AnalysisStatus
}

// UI slice state
export type ActivePanel = 'timeline' | 'logs' | 'clusters' | 'anomalies'

export interface UiState {
  selectedLogId: number | null
  activePanel: ActivePanel
  searchQuery: string
  sidebarOpen: boolean
  focusedRowIndex: number
}

// Combined app state
export interface AppState {
  ingestion: IngestionState
  logs: LogsState
  analysis: AnalysisState
  ui: UiState
}
