/**
 * Markdown formatter — GitHub-flavored Markdown suitable for PR comments and CI artifacts.
 */
import type { AnalysisReport, Anomaly } from '../../core/types/results'
import type { FormatOptions, Formatter } from './types'

export const markdownFormatter: Formatter = (
  report: AnalysisReport,
  options: FormatOptions = {},
): string => {
  const { filePath = '' } = options
  const lines: string[] = []

  const durationSec = (report.meta.durationMs / 1000).toFixed(1)

  lines.push('# LogiLog Forensic Report')
  lines.push('')
  if (filePath) lines.push(`**File:** \`${filePath}\``)
  lines.push(
    `**Found:** ${report.summary.totalAnomalies} anomalies in ` +
      `${report.summary.totalClusters} clusters | ` +
      `**Duration:** ${durationSec}s | ` +
      `**Lines:** ${report.meta.inputLines} | ` +
      `**Parser:** ${report.meta.parserUsed}`,
  )
  lines.push('')

  if (report.anomalies.length === 0) {
    lines.push('> ✅ No anomalies detected.')
    return lines.join('\n')
  }

  lines.push('## Anomalies')
  lines.push('')

  for (const anomaly of report.anomalies) {
    formatAnomalyMd(anomaly, lines)
  }

  if (report.clusters.length > 0) {
    lines.push('## Clusters')
    lines.push('')
    lines.push('| ID | Label | Size |')
    lines.push('|----|-------|------|')
    for (const cluster of report.clusters) {
      lines.push(`| ${cluster.id} | ${escapeCell(cluster.label)} | ${cluster.size} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatAnomalyMd(anomaly: Anomaly, lines: string[]): void {
  lines.push(
    `### #${anomaly.rank} — \`${anomaly.level}\` | Score: ${anomaly.score.toFixed(4)} | Line ${anomaly.line}`,
  )
  lines.push('')
  lines.push(`**Source:** \`${anomaly.source}\``)
  lines.push(`**Message:** ${anomaly.message}`)
  lines.push('')

  if (anomaly.context.narrative) {
    lines.push(`> ${anomaly.context.narrative}`)
    lines.push('')
  }

  if (anomaly.context.precedingLines.length > 0) {
    lines.push('<details>')
    lines.push('<summary>Context lines</summary>')
    lines.push('')
    lines.push('```')
    for (const l of anomaly.context.precedingLines) {
      lines.push(`[${new Date(l.timestamp).toISOString()}] ${l.level} ${l.source}: ${l.message}`)
    }
    lines.push('```')
    lines.push('')
    lines.push('</details>')
    lines.push('')
  }

  if (anomaly.aiForensics) {
    lines.push('**AI Analysis:**')
    lines.push(`- **Root cause:** ${anomaly.aiForensics.rootCause}`)
    lines.push(`- **Suggested fix:** ${anomaly.aiForensics.suggestedFix}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|')
}
