import type { LogParser, ParsedEntry } from '../../lib/logParser'
import type { LogLevel } from '../../types/log.types'

// 127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET / HTTP/1.1" 200 2326
const COMBINED_RE =
  /^(\S+)\s+\S+\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*?)"\s+(\d{3})\s+\S+/

const APACHE_MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parseApacheDate(raw: string): number {
  // "10/Oct/2000:13:55:36 -0700"
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})$/.exec(raw)
  if (!m) return Date.now()
  const [, day, mon, year, hh, mm, ss, tz] = m
  const tzSign = tz?.startsWith('-') ? -1 : 1
  const tzH = parseInt((tz ?? '0000').slice(1, 3), 10)
  const tzM = parseInt((tz ?? '0000').slice(3), 10)
  const utcOffset = tzSign * (tzH * 60 + tzM) * 60000
  return new Date(
    parseInt(year ?? '2000', 10),
    APACHE_MONTHS[mon ?? 'Jan'] ?? 0,
    parseInt(day ?? '1', 10),
    parseInt(hh ?? '0', 10),
    parseInt(mm ?? '0', 10),
    parseInt(ss ?? '0', 10),
  ).getTime() - utcOffset
}

function statusToLevel(status: number): LogLevel {
  if (status >= 500) return 'ERROR'
  if (status >= 400) return 'WARN'
  return 'INFO'
}

export const ApacheCombinedParser: LogParser = {
  name: 'apache-combined',

  detect(sampleLines) {
    return sampleLines.some((l) => COMBINED_RE.test(l))
  },

  confidence(sampleLines) {
    const matches = sampleLines.filter((l) => COMBINED_RE.test(l)).length
    return sampleLines.length > 0 ? matches / sampleLines.length : 0
  },

  parse(line): ParsedEntry | null {
    const m = COMBINED_RE.exec(line)
    if (!m) return null
    const [, ip, , dateStr, request, statusStr] = m
    const status = parseInt(statusStr ?? '200', 10)
    return {
      timestamp: parseApacheDate(dateStr ?? ''),
      level: statusToLevel(status),
      source: ip ?? 'unknown',
      message: `${request ?? ''} ${statusStr ?? ''}`.trim(),
      raw: line,
    }
  },
}
