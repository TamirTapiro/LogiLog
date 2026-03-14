import Anthropic from '@anthropic-ai/sdk'
import type { AiForensicsResult } from '../types/store.types'
import type { SmartContext } from '../types/analysis.types'
import type { LogEntry } from '../types/log.types'

interface ForensicsInput {
  log: LogEntry
  context: SmartContext | undefined
  score: number
  rank: number
  totalAnomalies: number
}

export async function runAiForensics(input: ForensicsInput): Promise<AiForensicsResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
  if (!apiKey) throw new Error('no-key')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const { log, context, score, rank, totalAnomalies } = input

  const precedingLines = context?.precedingLines
    .slice(-8)
    .map((l) => `[${new Date(l.timestamp).toISOString()}] ${l.level} ${l.source}: ${l.message}`)
    .join('\n')

  const prompt = `You are a senior SRE analyzing production log anomalies. Given the following anomaly data, provide a concise root cause analysis and suggested fix.

ANOMALY DETAILS:
- Timestamp: ${new Date(log.timestamp).toISOString()}
- Source: ${log.source}
- Level: ${log.level}
- Message: ${log.message}
- Anomaly Score: ${score.toFixed(4)} (rank #${rank} of ${totalAnomalies})

PRECEDING LOG CONTEXT:
${precedingLines ?? '(no context available)'}

${context?.narrative ? `CONTEXT NARRATIVE:\n${context.narrative}` : ''}

Respond with a JSON object (no markdown, no code block) with exactly these two fields:
{
  "rootCause": "2-3 sentence explanation of what likely caused this anomaly",
  "suggestedFix": "2-3 sentence actionable recommendation to resolve the issue"
}`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content.find((b) => b.type === 'text')?.text ?? ''
  const parsed = JSON.parse(text) as { rootCause: string; suggestedFix: string }
  return { rootCause: parsed.rootCause, suggestedFix: parsed.suggestedFix }
}
