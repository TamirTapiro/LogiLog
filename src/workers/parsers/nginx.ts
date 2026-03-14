import type { LogParser, ParsedEntry } from '../../lib/logParser'
import type { LogLevel } from '../../types/log.types'

// nginx combined: 127.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET / HTTP/1.1" 200 612 "-" "curl/7.68"
// nginx error:    2024/01/01 00:00:00 [error] 1#0: *1 connect() failed ...
const ACCESS_RE = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]*?)"\s+(\d{3})\s+\S+/
const ERROR_RE = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+\d+#\d+:\s*(.*)/

const NGINX_MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}

function parseNginxAccessDate(raw: string): number {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})$/.exec(raw)
  if (!m) return Date.now()
  const [, day, mon, year, hh, mm, ss, tz] = m
  const tzSign = tz?.startsWith('-') ? -1 : 1
  const tzH = parseInt((tz ?? '0000').slice(1, 3), 10)
  const tzM = parseInt((tz ?? '0000').slice(3), 10)
  const utcOffset = tzSign * (tzH * 60 + tzM) * 60000
  return (
    new Date(
      parseInt(year ?? '2000', 10),
      NGINX_MONTHS[mon ?? 'Jan'] ?? 0,
      parseInt(day ?? '1', 10),
      parseInt(hh ?? '0', 10),
      parseInt(mm ?? '0', 10),
      parseInt(ss ?? '0', 10),
    ).getTime() - utcOffset
  )
}

function statusToLevel(status: number): LogLevel {
  if (status >= 500) return 'ERROR'
  if (status >= 400) return 'WARN'
  return 'INFO'
}

import { normalizeLevel } from '../../lib/logParser'

export const NginxParser: LogParser = {
  name: 'nginx',

  detect(sampleLines) {
    return sampleLines.some((l) => ACCESS_RE.test(l) || ERROR_RE.test(l))
  },

  confidence(sampleLines) {
    const matches = sampleLines.filter((l) => ACCESS_RE.test(l) || ERROR_RE.test(l)).length
    return sampleLines.length > 0 ? matches / sampleLines.length : 0
  },

  parse(line): ParsedEntry | null {
    const err = ERROR_RE.exec(line)
    if (err) {
      const [, dateStr, lvl, msg] = err
      return {
        timestamp: new Date(dateStr?.replace(/\//g, '-') ?? '').getTime() || Date.now(),
        level: normalizeLevel(lvl ?? ''),
        source: 'nginx',
        message: (msg ?? '').trim(),
        raw: line,
      }
    }

    const acc = ACCESS_RE.exec(line)
    if (acc) {
      const [, ip, dateStr, request, statusStr] = acc
      const status = parseInt(statusStr ?? '200', 10)
      return {
        timestamp: parseNginxAccessDate(dateStr ?? ''),
        level: statusToLevel(status),
        source: ip ?? 'nginx',
        message: `${request ?? ''} ${statusStr ?? ''}`.trim(),
        raw: line,
      }
    }

    return null
  },
}
