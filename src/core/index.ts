// Public API — the programmatic entry point for the logilog npm package
export { analyze } from './pipeline'
export type {
  AnalyzeOptions,
  AnalysisReport,
  Anomaly,
  AnomalyContext,
  Cluster,
  AnalysisMeta,
  AnalysisSummary,
  AiForensics,
} from './types/results'
export type { LogLevel, LogEntry, ParsedBatch } from './types/log'
export type { EmbeddingVector, AnomalyResult, ClusterResult, SmartContext } from './types/analysis'
