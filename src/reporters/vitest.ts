/**
 * Vitest reporter plugin for LogiLog.
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { defineConfig } from 'vitest/config'
 * export default defineConfig({
 *   test: {
 *     reporters: ['default', ['logilog/vitest', { logFiles: ['./logs/server.log'] }]],
 *   },
 * })
 * ```
 */

import { analyze } from '../core/pipeline'
import { getFormatter } from '../cli/formatters/index'
import { writeFileSync } from 'fs'

export interface LogiLogReporterOptions {
  /** Glob(s) pointing to log files to analyze */
  logFiles?: string[]
  /** Anomaly threshold (default: 0.35) */
  threshold?: number
  /** Output format: terminal | json | markdown (default: terminal) */
  format?: 'terminal' | 'json' | 'markdown'
  /** Write report to file instead of stdout */
  outputFile?: string
  /** Enable AI forensics (requires ANTHROPIC_API_KEY) */
  ai?: boolean
  /** Max anomalies to show (default: 5) */
  top?: number
}

// Vitest Reporter interface (minimal subset needed)
interface VitestReporter {
  onInit?(ctx: unknown): void
  onFinished?(files: unknown[], errors?: unknown[]): Promise<void> | void
}

export default class LogiLogVitestReporter implements VitestReporter {
  private options: LogiLogReporterOptions

  constructor(options: LogiLogReporterOptions = {}) {
    this.options = options
  }

  async onFinished(files: unknown[]): Promise<void> {
    // Check if any test failed
    const hasFailures = checkForFailures(files)
    if (!hasFailures) return

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

    // Analyze each log file
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
          process.stderr.write('\n' + output + '\n')
        }
      } catch {
        // Non-fatal: skip this log file
      }
    }
  }
}

function checkForFailures(files: unknown[]): boolean {
  if (!Array.isArray(files)) return false
  return files.some((f) => {
    const file = f as Record<string, unknown>
    // Vitest file result format
    if (typeof file['result'] === 'object' && file['result'] !== null) {
      const result = file['result'] as Record<string, unknown>
      if (typeof result['state'] === 'string') {
        return result['state'] === 'fail'
      }
    }
    return false
  })
}
