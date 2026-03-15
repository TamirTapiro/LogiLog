/**
 * Jest reporter plugin for LogiLog.
 *
 * Usage in jest.config.js:
 * ```js
 * module.exports = {
 *   reporters: ['default', ['logilog/jest', { logFiles: ['./logs/test-server.log'] }]],
 * }
 * ```
 */

import { writeFileSync } from 'fs'
import { analyze } from '../core/pipeline'
import { getFormatter } from '../cli/formatters/index'
import type { LogiLogReporterOptions } from './vitest'

// Re-export the shared options type
export type { LogiLogReporterOptions }

// Jest 29 GlobalConfig / AggregatedResult minimal types
interface JestGlobalConfig {
  rootDir: string
}

interface JestAggregatedResult {
  numFailedTests: number
  numPassedTests: number
  numTotalTests: number
  testResults: unknown[]
}

export default class LogiLogJestReporter {
  private options: LogiLogReporterOptions

  constructor(_globalConfig: JestGlobalConfig, options: LogiLogReporterOptions = {}) {
    this.options = options
  }

  async onRunComplete(_contexts: unknown, results: JestAggregatedResult): Promise<void> {
    // Only run if there are failures
    if (results.numFailedTests === 0) return

    const {
      logFiles,
      threshold = 0.35,
      format = 'terminal',
      outputFile,
      ai = false,
      top = 5,
    } = this.options

    if (!logFiles || logFiles.length === 0) {
      // No log files configured — skip analysis
      return
    }

    const anthropicApiKey = ai ? process.env['ANTHROPIC_API_KEY'] : undefined

    for (const logFile of logFiles) {
      try {
        const report = await analyze({
          input: logFile,
          threshold,
          top,
          anthropicApiKey,
        })

        const formatter = getFormatter(format)
        const output = formatter(report, { filePath: logFile })

        if (outputFile) {
          writeFileSync(outputFile, output, 'utf-8')
        } else {
          // Print to stderr so it appears after Jest's own output
          process.stderr.write('\n' + output + '\n')
        }
      } catch {
        // Non-fatal: skip this log file
      }
    }
  }
}
