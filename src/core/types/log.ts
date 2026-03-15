export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN'

export interface LogEntry {
  id: number
  timestamp: number
  level: LogLevel
  source: string
  message: string
  raw: string
  byteOffset: number
}

export interface ParsedBatch {
  entries: LogEntry[]
  totalParsed: number
  done: boolean
}
