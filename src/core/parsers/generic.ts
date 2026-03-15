import type { LogParser, ParsedEntry } from './logParser'
import { normalizeLevel } from './logParser'

// ISO 8601: 2024-01-01T00:00:00.000Z or 2024-01-01 00:00:00
const ISO_RE = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/
// Epoch ms/s: 10+ digits (ms) or exactly 10 digits (s)
const EPOCH_RE = /\b(1[0-9]{12})\b|\b(1[0-9]{9})\b/
const LEVEL_RE =
  /\b(TRACE|DEBUG|INFO|INFORMATION|WARN|WARNING|ERROR|ERR|FATAL|CRIT|CRITICAL|EMERG|ALERT)\b/i

export const GenericTimestampParser: LogParser = {
  name: 'generic',

  detect(sampleLines) {
    return sampleLines.some((l) => ISO_RE.test(l) || EPOCH_RE.test(l))
  },

  confidence(sampleLines) {
    const matches = sampleLines.filter((l) => ISO_RE.test(l) || EPOCH_RE.test(l)).length
    // Generic is always a fallback — cap at 0.4 so others win when they match
    return sampleLines.length > 0 ? (matches / sampleLines.length) * 0.4 : 0
  },

  parse(line): ParsedEntry | null {
    if (!line.trim()) return null

    let timestamp = Date.now()

    const isoMatch = ISO_RE.exec(line)
    if (isoMatch) {
      const parsed = new Date(isoMatch[1] ?? '').getTime()
      if (!isNaN(parsed)) timestamp = parsed
    } else {
      const epochMatch = EPOCH_RE.exec(line)
      if (epochMatch) {
        const ms = epochMatch[1]
          ? parseInt(epochMatch[1], 10)
          : parseInt(epochMatch[2] ?? '0', 10) * 1000
        if (ms > 0) timestamp = ms
      }
    }

    const levelMatch = LEVEL_RE.exec(line)
    const level = normalizeLevel(levelMatch?.[1] ?? 'unknown')

    // Source: try to extract a word before the level, or 'unknown'
    let source = 'unknown'
    if (levelMatch && levelMatch.index > 0) {
      const before = line.slice(0, levelMatch.index).trim()
      const words = before.split(/\s+/)
      const lastWord = words[words.length - 1] ?? ''
      if (lastWord && lastWord.length < 60) source = lastWord
    }

    // Message: everything after the level keyword
    let message = line
    if (levelMatch) {
      message = line
        .slice(levelMatch.index + levelMatch[0].length)
        .replace(/^[\s:]+/, '')
        .trim()
      if (!message) message = line
    }

    return { timestamp, level, source, message, raw: line }
  },
}
