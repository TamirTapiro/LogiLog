// Public API entry point — fully implemented in issue #35
export type { LogLevel, LogEntry, ParsedBatch } from './types/log'
export type { EmbeddingVector, AnomalyResult, ClusterResult, SmartContext } from './types/analysis'
export { scoreAnomalies, cluster, kMeansPlusPlus, extractLabel } from './analysis/index'
export { extractContext, deduplicateLines, buildNarrative } from './context/index'
export { ParserRegistry } from './parsers/index'
export type { LogParser, ParsedEntry } from './parsers/index'
export { normalizeLevel } from './parsers/index'
export { cosineSimilarity, cosineDistance, l2Normalize, l2Distance } from './math/cosineSimilarity'
