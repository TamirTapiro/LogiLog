import type { LogEntry, LogLevel } from './log'

/** Options passed to analyze() */
export interface AnalyzeOptions {
  /** File path, raw log content (auto-detected), or async iterable of lines */
  input: string | AsyncIterable<string>

  /** Anomaly detection threshold 0–1 (default: 0.35) */
  threshold?: number

  /** Lines of context preceding each anomaly (default: 75) */
  contextWindow?: number

  /** Max anomalies to return (default: unlimited) */
  top?: number

  /** Force a specific parser: 'json' | 'syslog' | 'k8s' | 'apache' | 'nginx' | 'generic' */
  parser?: string

  /** Model cache directory (default: ~/.cache/logilog) */
  cacheDir?: string

  /** Anthropic API key for AI forensics (optional) */
  anthropicApiKey?: string

  /** Progress callback: stage name and 0–100 percent */
  onProgress?: (stage: string, percent: number) => void
}

/** Per-anomaly AI forensics result */
export interface AiForensics {
  rootCause: string
  suggestedFix: string
}

/** Smart context around an anomaly */
export interface AnomalyContext {
  precedingLines: LogEntry[]
  narrative: string
  relatedLines: LogEntry[]
}

/** A single detected anomaly */
export interface Anomaly {
  rank: number
  score: number
  line: number
  level: LogLevel
  source: string
  message: string
  timestamp: number
  context: AnomalyContext
  aiForensics?: AiForensics
}

/** A cluster of semantically similar log entries */
export interface Cluster {
  id: number
  label: string
  size: number
  memberLines: number[]
}

/** Metadata about the analysis run */
export interface AnalysisMeta {
  inputLines: number
  parserUsed: string
  modelId: string
  durationMs: number
  analyzedAt: string
}

/** Severity breakdown summary */
export interface SeverityBreakdown {
  TRACE: number
  DEBUG: number
  INFO: number
  WARN: number
  ERROR: number
  FATAL: number
  UNKNOWN: number
}

/** Summary statistics */
export interface AnalysisSummary {
  totalAnomalies: number
  totalClusters: number
  topAnomaly: Anomaly | null
  severityBreakdown: SeverityBreakdown
}

/** The full analysis report returned by analyze() */
export interface AnalysisReport {
  anomalies: Anomaly[]
  clusters: Cluster[]
  meta: AnalysisMeta
  summary: AnalysisSummary
}
