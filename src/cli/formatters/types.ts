import type { AnalysisReport } from '../../core/types/results'

export interface FormatOptions {
  verbose?: boolean
  filePath?: string
}

export type Formatter = (report: AnalysisReport, options: FormatOptions) => string
