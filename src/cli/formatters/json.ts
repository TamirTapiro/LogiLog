/**
 * JSON formatter — serializes AnalysisReport directly, pretty-printed.
 */
import type { AnalysisReport } from '../../core/types/results'
import type { FormatOptions, Formatter } from './types'

export const jsonFormatter: Formatter = (report: AnalysisReport, _options: FormatOptions = {}): string => {
  return JSON.stringify(report, null, 2)
}
