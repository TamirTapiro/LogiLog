/**
 * Terminal formatter — colored output using chalk.
 */
import chalk from 'chalk'
import type { AnalysisReport, Anomaly } from '../../core/types/results'
import type { FormatOptions, Formatter } from './types'

const MAX_MSG_LEN = 120

function scoreBar(score: number, width = 20): string {
  const filled = Math.round(score * width)
  return chalk.red('█'.repeat(filled)) + chalk.gray('░'.repeat(width - filled))
}

function levelColor(level: string): string {
  switch (level) {
    case 'FATAL':
      return chalk.bgRed.white.bold(level)
    case 'ERROR':
      return chalk.red.bold(level)
    case 'WARN':
      return chalk.yellow(level)
    case 'INFO':
      return chalk.green(level)
    case 'DEBUG':
      return chalk.cyan(level)
    case 'TRACE':
      return chalk.gray(level)
    default:
      return chalk.white(level)
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

export const terminalFormatter: Formatter = (
  report: AnalysisReport,
  options: FormatOptions = {},
): string => {
  const { verbose = false, filePath = '' } = options
  const lines: string[] = []

  // ── Header ──
  const durationSec = (report.meta.durationMs / 1000).toFixed(1)
  lines.push(chalk.bold.cyan('┌─────────────────────────────────────────────────────────┐'))
  lines.push(
    chalk.bold.cyan('│') +
      chalk.bold.white('  LogiLog Forensic Report') +
      chalk.bold.cyan('                                │'),
  )
  lines.push(chalk.bold.cyan('├─────────────────────────────────────────────────────────┤'))
  lines.push(
    chalk.bold.cyan('│') +
      `  ${chalk.yellow('Found')} ${chalk.bold(String(report.summary.totalAnomalies))} anomalies` +
      ` in ${chalk.bold(String(report.summary.totalClusters))} clusters` +
      chalk.bold.cyan('  │'),
  )
  if (filePath) {
    lines.push(chalk.bold.cyan('│') + `  ${chalk.gray('File:')} ${chalk.white(filePath)}`)
  }
  lines.push(
    chalk.bold.cyan('│') +
      `  ${chalk.gray('Duration:')} ${durationSec}s  |  ` +
      `${chalk.gray('Lines:')} ${report.meta.inputLines}  |  ` +
      `${chalk.gray('Parser:')} ${report.meta.parserUsed}`,
  )
  lines.push(chalk.bold.cyan('└─────────────────────────────────────────────────────────┘'))
  lines.push('')

  if (report.anomalies.length === 0) {
    lines.push(chalk.green('  ✓ No anomalies detected.'))
    return lines.join('\n')
  }

  // ── Anomalies ──
  lines.push(chalk.bold.white('ANOMALIES'))
  lines.push(chalk.gray('─'.repeat(60)))

  for (const anomaly of report.anomalies) {
    formatAnomaly(anomaly, lines, verbose)
  }

  // ── Clusters ──
  if (report.clusters.length > 0) {
    lines.push('')
    lines.push(chalk.bold.white('CLUSTERS'))
    lines.push(chalk.gray('─'.repeat(60)))

    const maxLabel = Math.max(...report.clusters.map((c) => c.label.length), 5)
    lines.push(chalk.gray('ID'.padEnd(5) + 'Label'.padEnd(maxLabel + 2) + 'Size'))
    for (const cluster of report.clusters.slice(0, 10)) {
      lines.push(
        chalk.white(String(cluster.id).padEnd(5)) +
          chalk.cyan(cluster.label.padEnd(maxLabel + 2)) +
          chalk.yellow(String(cluster.size)),
      )
    }
    if (report.clusters.length > 10) {
      lines.push(chalk.gray(`  … and ${report.clusters.length - 10} more clusters`))
    }
  }

  return lines.join('\n')
}

function formatAnomaly(anomaly: Anomaly, lines: string[], verbose: boolean): void {
  lines.push('')
  lines.push(
    chalk.bold.red(`#${anomaly.rank}`) +
      '  ' +
      scoreBar(anomaly.score) +
      '  ' +
      chalk.yellow(anomaly.score.toFixed(4)) +
      '  ' +
      chalk.gray(`line ${anomaly.line}`),
  )
  lines.push(
    '   ' +
      levelColor(anomaly.level) +
      '  ' +
      chalk.gray(anomaly.source) +
      '  ' +
      chalk.white(truncate(anomaly.message, MAX_MSG_LEN)),
  )

  // Context narrative
  if (anomaly.context.narrative) {
    lines.push('   ' + chalk.italic.gray(anomaly.context.narrative))
  }

  // Preceding lines (tree style)
  const preceding = anomaly.context.precedingLines.slice(-5)
  if (preceding.length > 0) {
    lines.push('   ' + chalk.gray('Context:'))
    for (let i = 0; i < preceding.length; i++) {
      const isLast = i === preceding.length - 1
      const prefix = isLast ? '   └─ ' : '   ├─ '
      const entry = preceding[i]!
      lines.push(
        chalk.gray(prefix) +
          levelColor(entry.level) +
          '  ' +
          chalk.gray(truncate(entry.message, 80)),
      )
    }
  }

  // AI forensics
  if (anomaly.aiForensics) {
    lines.push('')
    lines.push('   ' + chalk.bold.magenta('AI Analysis:'))
    lines.push('   ' + chalk.magenta('Root cause: ') + anomaly.aiForensics.rootCause)
    lines.push('   ' + chalk.magenta('Fix: ') + anomaly.aiForensics.suggestedFix)
  }

  if (verbose && anomaly.context.precedingLines.length > 5) {
    lines.push(chalk.gray(`   (${anomaly.context.precedingLines.length} preceding lines total)`))
  }
}
