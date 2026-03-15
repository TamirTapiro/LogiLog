import type { LogLevel } from '../types/log'
import type { LogEntry } from '../types/log'

export type ParsedEntry = Omit<LogEntry, 'id' | 'byteOffset'>

export interface LogParser {
  name: string
  detect(sampleLines: string[]): boolean
  confidence(sampleLines: string[]): number
  parse(line: string): ParsedEntry | null
}

/** Normalize various level strings to canonical LogLevel */
export function normalizeLevel(raw: string): LogLevel {
  const up = raw.toUpperCase().trim()
  if (up === 'TRACE') return 'TRACE'
  if (up === 'DEBUG') return 'DEBUG'
  if (up === 'INFO' || up === 'INFORMATION') return 'INFO'
  if (up === 'WARN' || up === 'WARNING') return 'WARN'
  if (up === 'ERROR' || up === 'ERR') return 'ERROR'
  if (up === 'FATAL' || up === 'CRIT' || up === 'CRITICAL' || up === 'EMERG' || up === 'ALERT')
    return 'FATAL'
  return 'UNKNOWN'
}
