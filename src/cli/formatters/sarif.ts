/**
 * SARIF 2.1.0 formatter — each anomaly becomes a result with physicalLocation.
 * Enables GitHub to render annotations on the log file.
 */
import type { AnalysisReport } from '../../core/types/results'
import type { FormatOptions, Formatter } from './types'

interface SarifResult {
  ruleId: string
  level: string
  message: { text: string }
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string }
      region: { startLine: number }
    }
  }>
  properties?: { score: number; rank: number }
}

interface SarifLog {
  version: string
  $schema: string
  runs: Array<{
    tool: {
      driver: {
        name: string
        version: string
        informationUri: string
        rules: Array<{
          id: string
          name: string
          shortDescription: { text: string }
        }>
      }
    }
    results: SarifResult[]
    artifacts?: Array<{
      location: { uri: string }
      length?: number
    }>
  }>
}

function levelToSarif(level: string): string {
  switch (level) {
    case 'FATAL':
    case 'ERROR':
      return 'error'
    case 'WARN':
      return 'warning'
    default:
      return 'note'
  }
}

export const sarifFormatter: Formatter = (
  report: AnalysisReport,
  options: FormatOptions = {},
): string => {
  const { filePath = 'unknown' } = options

  // Normalize file URI
  const fileUri = filePath.startsWith('/') ? `file://${filePath}` : filePath

  const results: SarifResult[] = report.anomalies.map((anomaly) => ({
    ruleId: 'LOGILOG001',
    level: levelToSarif(anomaly.level),
    message: {
      text: `[Anomaly #${anomaly.rank}, score ${anomaly.score.toFixed(4)}] ${anomaly.source}: ${anomaly.message}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: fileUri },
          region: { startLine: anomaly.line },
        },
      },
    ],
    properties: {
      score: anomaly.score,
      rank: anomaly.rank,
    },
  }))

  const sarif: SarifLog = {
    version: '2.1.0',
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'logilog',
            version: report.meta.modelId,
            informationUri: 'https://github.com/TamirTapiro/LogiLog',
            rules: [
              {
                id: 'LOGILOG001',
                name: 'LogAnomaly',
                shortDescription: { text: 'Detected semantic anomaly in log file' },
              },
            ],
          },
        },
        artifacts: [
          {
            location: { uri: fileUri },
            length: report.meta.inputLines,
          },
        ],
        results,
      },
    ],
  }

  return JSON.stringify(sarif, null, 2)
}
