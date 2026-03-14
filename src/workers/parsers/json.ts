import type { LogParser, ParsedEntry } from '../../lib/logParser'
import { normalizeLevel } from '../../lib/logParser'

type JsonRecord = Record<string, unknown>

export const JsonParser: LogParser = {
  name: 'json',

  detect(sampleLines) {
    return sampleLines.some((l) => {
      const t = l.trim()
      return t.startsWith('{') && isValidJson(t)
    })
  },

  confidence(sampleLines) {
    const matches = sampleLines.filter((l) => {
      const t = l.trim()
      return t.startsWith('{') && isValidJson(t)
    }).length
    return sampleLines.length > 0 ? matches / sampleLines.length : 0
  },

  parse(line): ParsedEntry | null {
    const t = line.trim()
    if (!t.startsWith('{')) return null
    let obj: JsonRecord
    try {
      obj = JSON.parse(t) as JsonRecord
    } catch {
      return null
    }

    const ts = extractTimestamp(obj)
    const level = normalizeLevel(String(obj['level'] ?? obj['severity'] ?? obj['lvl'] ?? 'unknown'))
    const message = String(obj['msg'] ?? obj['message'] ?? obj['text'] ?? obj['log'] ?? t)
    const source = String(obj['source'] ?? obj['logger'] ?? obj['service'] ?? obj['component'] ?? '')

    return {
      timestamp: ts,
      level,
      source,
      message,
      raw: line,
    }
  },
}

function isValidJson(s: string): boolean {
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

function extractTimestamp(obj: JsonRecord): number {
  const raw = obj['timestamp'] ?? obj['time'] ?? obj['ts'] ?? obj['@timestamp'] ?? obj['datetime']
  if (!raw) return Date.now()
  if (typeof raw === 'number') {
    // epoch ms vs epoch s heuristic
    return raw > 1e12 ? raw : raw * 1000
  }
  const parsed = new Date(String(raw)).getTime()
  return isNaN(parsed) ? Date.now() : parsed
}
