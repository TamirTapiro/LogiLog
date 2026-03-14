import type { LogParser, ParsedEntry } from '../../lib/logParser'
import { normalizeLevel } from '../../lib/logParser'

// Kubernetes structured log format:
// 2024-01-01T00:00:00.000Z INFO namespace/pod/container message
// Or JSON-formatted k8s logs with kubernetes metadata
const K8S_TEXT_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(\w+)\s+([\w.-]+\/[\w.-]+\/[\w.-]+)\s+(.*)/
const K8S_JSON_RE = /"kubernetes"\s*:/

type JsonRecord = Record<string, unknown>

export const K8sParser: LogParser = {
  name: 'k8s',

  detect(sampleLines) {
    return sampleLines.some(
      (l) => K8S_TEXT_RE.test(l) || (l.startsWith('{') && K8S_JSON_RE.test(l)),
    )
  },

  confidence(sampleLines) {
    const matches = sampleLines.filter(
      (l) => K8S_TEXT_RE.test(l) || (l.startsWith('{') && K8S_JSON_RE.test(l)),
    ).length
    return sampleLines.length > 0 ? matches / sampleLines.length : 0
  },

  parse(line): ParsedEntry | null {
    // Try JSON k8s first
    if (line.trim().startsWith('{') && K8S_JSON_RE.test(line)) {
      try {
        const obj = JSON.parse(line.trim()) as JsonRecord
        const k8s = obj['kubernetes'] as JsonRecord | undefined
        const ns = String(k8s?.['namespace_name'] ?? '')
        const pod = String(k8s?.['pod_name'] ?? '')
        const container = String(k8s?.['container_name'] ?? '')
        const source = [ns, pod, container].filter(Boolean).join('/') || 'k8s'
        const message = String(obj['log'] ?? obj['message'] ?? obj['msg'] ?? '')
        const level = normalizeLevel(String(obj['level'] ?? obj['severity'] ?? 'unknown'))
        const ts = new Date(String(obj['time'] ?? obj['timestamp'] ?? '')).getTime() || Date.now()
        return { timestamp: ts, level, source, message, raw: line }
      } catch {
        return null
      }
    }

    // Try text k8s format
    const m = K8S_TEXT_RE.exec(line)
    if (!m) return null
    const [, tsStr, lvl, source, msg] = m
    return {
      timestamp: new Date(tsStr ?? '').getTime() || Date.now(),
      level: normalizeLevel(lvl ?? ''),
      source: source ?? 'k8s',
      message: (msg ?? '').trim(),
      raw: line,
    }
  },
}
