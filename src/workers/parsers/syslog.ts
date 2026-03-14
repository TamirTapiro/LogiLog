import type { LogParser, ParsedEntry } from '../../lib/logParser'
import { normalizeLevel } from '../../lib/logParser'

// RFC 3164: Oct 11 22:14:15 mymachine myapp[1234]: message
// RFC 5424: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
const RFC3164_RE =
  /^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s*(.*)$/
const RFC5424_RE =
  /^<(\d+)>(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(?:-|\[.*?\])\s*(.*)$/

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parseSyslogDate(dateStr: string): number {
  // e.g. "Oct 11 22:14:15"
  const parts = dateStr.trim().split(/\s+/)
  if (parts.length < 3) return Date.now()
  const month = MONTHS[parts[0] ?? ''] ?? 0
  const day = parseInt(parts[1] ?? '1', 10)
  const timeParts = (parts[2] ?? '00:00:00').split(':').map(Number)
  const year = new Date().getFullYear()
  return new Date(year, month, day, timeParts[0], timeParts[1], timeParts[2]).getTime()
}

export const SyslogParser: LogParser = {
  name: 'syslog',

  detect(sampleLines) {
    return sampleLines.some((l) => RFC3164_RE.test(l) || RFC5424_RE.test(l))
  },

  confidence(sampleLines) {
    const matches = sampleLines.filter((l) => RFC3164_RE.test(l) || RFC5424_RE.test(l)).length
    return sampleLines.length > 0 ? matches / sampleLines.length : 0
  },

  parse(line): ParsedEntry | null {
    const m3164 = RFC3164_RE.exec(line)
    if (m3164) {
      const [, dateStr, host, app, , msg] = m3164
      return {
        timestamp: parseSyslogDate(dateStr ?? ''),
        level: normalizeLevel(msg?.split(':')[0] ?? '') === 'UNKNOWN'
          ? detectLevelFromMsg(msg ?? '')
          : normalizeLevel(msg?.split(':')[0] ?? ''),
        source: `${host ?? 'unknown'}/${app ?? 'unknown'}`,
        message: (msg ?? '').trim(),
        raw: line,
      }
    }

    const m5424 = RFC5424_RE.exec(line)
    if (m5424) {
      const [, pri, , timestamp, hostname, appName, , , msg] = m5424
      const severity = parseInt(pri ?? '6', 10) & 0x07
      return {
        timestamp: new Date(timestamp ?? '').getTime() || Date.now(),
        level: severityToLevel(severity),
        source: `${hostname ?? 'unknown'}/${appName ?? 'unknown'}`,
        message: (msg ?? '').trim(),
        raw: line,
      }
    }

    return null
  },
}

function severityToLevel(s: number) {
  if (s <= 2) return 'FATAL' as const
  if (s === 3) return 'ERROR' as const
  if (s === 4) return 'WARN' as const
  if (s === 5 || s === 6) return 'INFO' as const
  return 'DEBUG' as const
}

function detectLevelFromMsg(msg: string) {
  return normalizeLevel(
    /\b(trace|debug|info|warn|warning|error|err|fatal|crit|critical)\b/i.exec(msg)?.[1] ?? 'unknown'
  )
}
