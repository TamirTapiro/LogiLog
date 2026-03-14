import { describe, it, expect } from 'vitest'
import type { LogLevel } from '../types/log.types'
import { SyslogParser } from '../workers/parsers/syslog'
import { JsonParser } from '../workers/parsers/json'
import { ApacheCombinedParser } from '../workers/parsers/apache'
import { NginxParser } from '../workers/parsers/nginx'
import { K8sParser } from '../workers/parsers/k8s'
import { GenericTimestampParser } from '../workers/parsers/generic'
import { ParserRegistry } from '../workers/parsers/registry'

const VALID_LEVELS: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'UNKNOWN']

function assertEntry(result: ReturnType<typeof SyslogParser.parse>) {
  expect(result).not.toBeNull()
  if (!result) return
  expect(typeof result.timestamp).toBe('number')
  expect(isFinite(result.timestamp)).toBe(true)
  expect(VALID_LEVELS).toContain(result.level)
  expect(typeof result.source).toBe('string')
  expect(result.source.length).toBeGreaterThan(0)
  expect(typeof result.message).toBe('string')
  expect(result.message.length).toBeGreaterThan(0)
}

// ---------------------------------------------------------------------------
// SyslogParser
// ---------------------------------------------------------------------------
describe('SyslogParser', () => {
  const rfc3164Lines = [
    'Oct 11 22:14:15 mymachine myapp[1234]: Connection refused',
    'Jan  1 00:00:00 host kernel: EXT4-fs error',
    'Mar 15 08:30:00 web01 nginx[999]: worker process started',
    'Dec 31 23:59:59 db01 postgres[5432]: database system ready',
    'Jul  4 12:00:00 srv01 sshd[22]: Accepted publickey for user',
    'Sep  9 09:09:09 app01 myapp[0]: INFO: Service started successfully',
    'Feb 28 14:45:00 host01 cron[100]: ERROR: job failed',
    'Nov 11 11:11:11 loadbal haproxy[8080]: WARN: Backend down',
    'May  5 05:05:05 worker celery[1]: DEBUG: Task received',
    'Jun 21 20:00:00 mail postfix[25]: message delivered',
  ]

  const rfc5424Lines = [
    '<34>1 2024-01-01T00:00:00Z mymachine myapp 1234 - - Connection refused',
    '<165>1 2024-06-15T12:30:00Z webserver nginx 5678 - - GET / HTTP/1.1',
    '<11>1 2024-03-10T08:00:00Z dbhost postgres 999 - - database ready',
  ]

  it('detect() returns true for RFC 3164 lines', () => {
    expect(SyslogParser.detect(rfc3164Lines)).toBe(true)
  })

  it('detect() returns true for RFC 5424 lines', () => {
    expect(SyslogParser.detect(rfc5424Lines)).toBe(true)
  })

  it('detect() returns false for non-syslog lines', () => {
    expect(SyslogParser.detect(['just a plain log line', '{"json":"log"}'])).toBe(false)
  })

  it('parse() returns valid entries for RFC 3164 lines', () => {
    for (const line of rfc3164Lines) {
      assertEntry(SyslogParser.parse(line))
    }
  })

  it('parse() returns valid entries for RFC 5424 lines', () => {
    for (const line of rfc5424Lines) {
      assertEntry(SyslogParser.parse(line))
    }
  })

  it('parse() returns null for empty string', () => {
    expect(SyslogParser.parse('')).toBeNull()
  })

  it('parse() handles very long line without throwing', () => {
    const longLine = 'a'.repeat(10001)
    expect(() => SyslogParser.parse(longLine)).not.toThrow()
  })

  it('parse() handles non-ASCII in message without throwing', () => {
    const line = 'Oct 11 22:14:15 host myapp[1]: こんにちは world'
    expect(() => SyslogParser.parse(line)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// JsonParser
// ---------------------------------------------------------------------------
describe('JsonParser', () => {
  const samples = [
    '{"timestamp":"2024-01-01T00:00:00Z","level":"INFO","message":"hello","service":"api"}',
    '{"time":"2024-06-15T08:30:00Z","severity":"ERROR","msg":"request failed","logger":"http"}',
    '{"ts":1704067200000,"lvl":"DEBUG","log":"cache miss","component":"cache"}',
    '{"@timestamp":"2024-03-10T12:00:00Z","level":"WARN","message":"high latency","service":"gateway"}',
    '{"timestamp":"2024-01-15T00:00:00Z","level":"FATAL","message":"out of memory","service":"worker"}',
    '{"timestamp":"2024-02-01T00:00:00Z","level":"TRACE","message":"entering function","service":"core"}',
    '{"timestamp":"2024-04-01T00:00:00Z","level":"WARN","message":"retrying","service":"retry"}',
    '{"timestamp":"2024-05-01T00:00:00Z","level":"ERROR","message":"connection timeout","service":"db"}',
    '{"timestamp":"2024-07-04T00:00:00Z","level":"INFO","message":"holiday","service":"calendar"}',
    '{"ts":1000000000,"level":"DEBUG","msg":"epoch seconds","source":"timer"}',
  ]

  it('detect() returns true for JSON log lines', () => {
    expect(JsonParser.detect(samples)).toBe(true)
  })

  it('detect() returns false for non-JSON lines', () => {
    expect(JsonParser.detect(['plain text', 'Oct 11 22:14:15 host app: msg'])).toBe(false)
  })

  it('parse() returns valid entries for all samples', () => {
    for (const line of samples) {
      assertEntry(JsonParser.parse(line))
    }
  })

  it('parse() returns null for empty string', () => {
    expect(JsonParser.parse('')).toBeNull()
  })

  it('parse() returns null for invalid JSON', () => {
    expect(JsonParser.parse('{bad json')).toBeNull()
  })

  it('parse() handles very long line without throwing', () => {
    expect(() => JsonParser.parse('a'.repeat(10001))).not.toThrow()
  })

  it('parse() handles non-ASCII message without throwing', () => {
    const line = '{"timestamp":"2024-01-01T00:00:00Z","level":"INFO","message":"こんにちは"}'
    expect(() => JsonParser.parse(line)).not.toThrow()
    const result = JsonParser.parse(line)
    expect(result).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ApacheCombinedParser
// ---------------------------------------------------------------------------
describe('ApacheCombinedParser', () => {
  const samples = [
    '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/5.0"',
    '192.168.1.1 - - [01/Jan/2024:00:00:00 +0000] "POST /api/login HTTP/1.1" 401 512 "-" "curl/7.68"',
    '10.0.0.1 - user [15/Mar/2024:08:30:00 +0100] "DELETE /api/item/42 HTTP/1.1" 404 128 "-" "axios/1.0"',
    '172.16.0.1 - - [31/Dec/2023:23:59:59 +0000] "GET /health HTTP/1.1" 200 0 "-" "healthcheck/1.0"',
    '203.0.113.5 - admin [04/Jul/2024:12:00:00 -0400] "PUT /api/config HTTP/2" 500 1024 "-" "httpie/3.0"',
    '198.51.100.1 - - [21/Jun/2024:20:00:00 +0000] "GET /index.html HTTP/1.1" 200 4096 "http://example.com" "Firefox/120.0"',
    '192.0.2.1 - - [01/Feb/2024:14:45:00 +0000] "GET /robots.txt HTTP/1.1" 301 0 "-" "Googlebot/2.1"',
    '10.10.10.10 - - [11/Nov/2023:11:11:11 +0000] "OPTIONS / HTTP/1.1" 200 0 "-" "browser/1.0"',
    '192.168.0.50 - bob [05/May/2024:05:05:05 +0000] "GET /api/data HTTP/1.1" 403 256 "-" "Python-requests/2.0"',
    '127.0.0.2 - - [09/Sep/2024:09:09:09 +0000] "HEAD /ping HTTP/1.0" 200 0 "-" "ping/1.0"',
  ]

  it('detect() returns true for Apache combined log lines', () => {
    expect(ApacheCombinedParser.detect(samples)).toBe(true)
  })

  it('detect() returns false for non-Apache lines', () => {
    expect(ApacheCombinedParser.detect(['plain text', '{"json":"log"}'])).toBe(false)
  })

  it('parse() returns valid entries for all samples', () => {
    for (const line of samples) {
      assertEntry(ApacheCombinedParser.parse(line))
    }
  })

  it('parse() sets ERROR level for 5xx status', () => {
    const result = ApacheCombinedParser.parse(
      '203.0.113.5 - - [04/Jul/2024:12:00:00 -0400] "PUT /api/config HTTP/2" 500 1024 "-" "httpie/3.0"',
    )
    expect(result?.level).toBe('ERROR')
  })

  it('parse() sets WARN level for 4xx status', () => {
    const result = ApacheCombinedParser.parse(
      '192.168.1.1 - - [01/Jan/2024:00:00:00 +0000] "POST /api/login HTTP/1.1" 401 512 "-" "curl/7.68"',
    )
    expect(result?.level).toBe('WARN')
  })

  it('parse() sets INFO level for 2xx status', () => {
    const result = ApacheCombinedParser.parse(
      '127.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET / HTTP/1.1" 200 0 "-" "browser/1.0"',
    )
    expect(result?.level).toBe('INFO')
  })

  it('parse() returns null for empty string', () => {
    expect(ApacheCombinedParser.parse('')).toBeNull()
  })

  it('parse() handles very long line without throwing', () => {
    expect(() => ApacheCombinedParser.parse('a'.repeat(10001))).not.toThrow()
  })

  it('parse() handles non-ASCII characters without throwing', () => {
    const line =
      '127.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET /こんにちは HTTP/1.1" 200 0 "-" "browser"'
    expect(() => ApacheCombinedParser.parse(line)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// NginxParser
// ---------------------------------------------------------------------------
describe('NginxParser', () => {
  const accessSamples = [
    '127.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET / HTTP/1.1" 200 612 "-" "curl/7.68"',
    '192.168.1.1 - user [15/Mar/2024:08:30:00 +0100] "POST /api HTTP/1.1" 201 128 "-" "axios/1.0"',
    '10.0.0.1 - - [31/Dec/2023:23:59:59 +0000] "GET /health HTTP/1.1" 200 0 "-" "healthcheck"',
    '203.0.113.5 - - [04/Jul/2024:12:00:00 -0400] "PUT /api HTTP/2" 500 1024 "-" "httpie/3.0"',
    '172.16.0.1 - - [01/Feb/2024:14:45:00 +0000] "DELETE /api/42 HTTP/1.1" 404 256 "-" "curl/8.0"',
    '198.51.100.1 - - [21/Jun/2024:20:00:00 +0000] "GET /index.html HTTP/1.1" 301 0 "-" "bot/1.0"',
    '10.10.10.10 - - [11/Nov/2023:11:11:11 +0000] "OPTIONS / HTTP/1.1" 200 0 "-" "browser"',
  ]

  const errorSamples = [
    '2024/01/01 00:00:00 [error] 1#0: *1 connect() failed (111: Connection refused)',
    '2024/06/15 08:30:00 [warn] 5#5: *10 upstream timed out (110: Connection timed out)',
    '2024/03/10 12:00:00 [crit] 2#0: *3 SSL_do_handshake() failed',
  ]

  it('detect() returns true for nginx access log lines', () => {
    expect(NginxParser.detect(accessSamples)).toBe(true)
  })

  it('detect() returns true for nginx error log lines', () => {
    expect(NginxParser.detect(errorSamples)).toBe(true)
  })

  it('detect() returns false for non-nginx lines', () => {
    expect(NginxParser.detect(['plain text', '{"json":"log"}'])).toBe(false)
  })

  it('parse() returns valid entries for access log lines', () => {
    for (const line of accessSamples) {
      assertEntry(NginxParser.parse(line))
    }
  })

  it('parse() returns valid entries for error log lines', () => {
    for (const line of errorSamples) {
      assertEntry(NginxParser.parse(line))
    }
  })

  it('parse() returns null for empty string', () => {
    expect(NginxParser.parse('')).toBeNull()
  })

  it('parse() handles very long line without throwing', () => {
    expect(() => NginxParser.parse('a'.repeat(10001))).not.toThrow()
  })

  it('parse() handles non-ASCII characters without throwing', () => {
    const line =
      '127.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET /こんにちは HTTP/1.1" 200 0 "-" "b"'
    expect(() => NginxParser.parse(line)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// K8sParser
// ---------------------------------------------------------------------------
describe('K8sParser', () => {
  const textSamples = [
    '2024-01-01T12:00:00.000000000Z INFO default/my-pod/app reconciling resource',
    '2024-06-15T08:30:00.123456789Z WARN kube-system/coredns/dns plugin failed',
    '2024-03-10T08:00:00.000Z ERROR production/api-server/api request timeout',
    '2024-07-04T00:00:00Z DEBUG staging/worker/processor task dequeued',
    '2024-02-01T14:45:00.999Z INFO monitoring/prometheus/scraper scrape complete',
  ]

  const jsonSamples = [
    '{"time":"2024-01-01T00:00:00Z","level":"INFO","log":"pod started","kubernetes":{"namespace_name":"default","pod_name":"web-123","container_name":"nginx"}}',
    '{"timestamp":"2024-06-15T08:30:00Z","severity":"ERROR","message":"crash","kubernetes":{"namespace_name":"production","pod_name":"api-456","container_name":"app"}}',
    '{"time":"2024-03-10T12:00:00Z","level":"WARN","msg":"high memory","kubernetes":{"namespace_name":"monitoring","pod_name":"prom-789","container_name":"prometheus"}}',
  ]

  it('detect() returns true for K8s text format', () => {
    expect(K8sParser.detect(textSamples)).toBe(true)
  })

  it('detect() returns true for K8s JSON format', () => {
    expect(K8sParser.detect(jsonSamples)).toBe(true)
  })

  it('detect() returns false for non-k8s lines', () => {
    expect(K8sParser.detect(['plain text', 'Oct 11 22:14:15 host app: msg'])).toBe(false)
  })

  it('parse() returns valid entries for text format', () => {
    for (const line of textSamples) {
      assertEntry(K8sParser.parse(line))
    }
  })

  it('parse() returns valid entries for JSON format', () => {
    for (const line of jsonSamples) {
      assertEntry(K8sParser.parse(line))
    }
  })

  it('parse() returns null for empty string', () => {
    expect(K8sParser.parse('')).toBeNull()
  })

  it('parse() handles very long line without throwing', () => {
    expect(() => K8sParser.parse('a'.repeat(10001))).not.toThrow()
  })

  it('parse() handles non-ASCII in message without throwing', () => {
    const line = '2024-01-01T12:00:00.000Z INFO default/pod/app こんにちは'
    expect(() => K8sParser.parse(line)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// GenericTimestampParser
// ---------------------------------------------------------------------------
describe('GenericTimestampParser', () => {
  const samples = [
    '2024-01-01 12:00:00.000 INFO [main] Application started',
    '2024-06-15T08:30:00Z WARN [scheduler] Job delayed',
    '2024-03-10 08:00:00 ERROR [db] Connection pool exhausted',
    '2024-07-04T00:00:00.000Z DEBUG [cache] Cache miss for key: user-42',
    '2024-02-01T14:45:00+00:00 FATAL [service] Unhandled exception',
    '2024-11-11 11:11:11 TRACE [router] Entering handler',
    '2024-05-05 05:05:05 WARN [auth] Token expiring soon',
    '2024-09-09 09:09:09 INFO [api] Request received',
    '2024-12-31 23:59:59 ERROR [worker] Task failed after retries',
    '2024-04-15 16:30:00 DEBUG [parser] Parsed 1000 lines',
  ]

  it('detect() returns true for ISO timestamp lines', () => {
    expect(GenericTimestampParser.detect(samples)).toBe(true)
  })

  it('detect() returns false for lines with no timestamp', () => {
    expect(GenericTimestampParser.detect(['no timestamp here', 'just words'])).toBe(false)
  })

  it('parse() returns valid entries for all samples', () => {
    for (const line of samples) {
      assertEntry(GenericTimestampParser.parse(line))
    }
  })

  it('parse() returns null for empty string', () => {
    expect(GenericTimestampParser.parse('')).toBeNull()
  })

  it('parse() handles very long line without throwing', () => {
    expect(() => GenericTimestampParser.parse('a'.repeat(10001))).not.toThrow()
  })

  it('parse() handles non-ASCII characters without throwing', () => {
    const line = '2024-01-01 12:00:00.000 INFO [app] こんにちは world'
    expect(() => GenericTimestampParser.parse(line)).not.toThrow()
  })

  it('parse() detects epoch millisecond timestamps', () => {
    const line = '1704067200000 INFO [main] started'
    const result = GenericTimestampParser.parse(line)
    expect(result).not.toBeNull()
    expect(result?.timestamp).toBe(1704067200000)
  })
})

// ---------------------------------------------------------------------------
// ParserRegistry
// ---------------------------------------------------------------------------
describe('ParserRegistry', () => {
  it('auto-detects JSON parser for JSON lines', () => {
    const lines = [
      '{"timestamp":"2024-01-01T00:00:00Z","level":"INFO","message":"hello","service":"api"}',
      '{"timestamp":"2024-01-01T00:01:00Z","level":"ERROR","message":"oops","service":"api"}',
    ]
    const registry = new ParserRegistry(lines)
    expect(registry.parserName).toBe('json')
    const result = registry.parse(lines[0]!)
    expect(result).not.toBeNull()
  })

  it('auto-detects syslog parser for RFC 3164 lines', () => {
    const lines = [
      'Oct 11 22:14:15 mymachine myapp[1234]: Connection refused',
      'Nov  1 08:00:00 server01 kernel: EXT4-fs error',
    ]
    const registry = new ParserRegistry(lines)
    expect(registry.parserName).toBe('syslog')
    const result = registry.parse(lines[0]!)
    expect(result).not.toBeNull()
  })

  it('auto-detects apache parser for apache combined lines', () => {
    const lines = [
      '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/5.0"',
      '192.168.1.1 - - [01/Jan/2024:00:00:00 +0000] "POST /api HTTP/1.1" 404 128 "-" "curl/7"',
    ]
    const registry = new ParserRegistry(lines)
    expect(registry.parserName).toBe('apache-combined')
  })

  it('auto-detects k8s parser for k8s text lines', () => {
    const lines = [
      '2024-01-01T12:00:00.000000000Z INFO default/my-pod/app reconciling resource',
      '2024-01-01T12:01:00.000000000Z WARN kube-system/dns/dns plugin failed',
    ]
    const registry = new ParserRegistry(lines)
    expect(registry.parserName).toBe('k8s')
    const result = registry.parse(lines[0]!)
    expect(result).not.toBeNull()
    expect(VALID_LEVELS).toContain(result?.level)
  })

  it('falls back to generic parser when no specific format matches', () => {
    const lines = ['2024-01-01 12:00:00 INFO generic log line', '2024-01-01 12:01:00 DEBUG another']
    const registry = new ParserRegistry(lines)
    const result = registry.parse(lines[0]!)
    expect(result).not.toBeNull()
  })

  it('parse() returns correct level from detected parser', () => {
    const lines = [
      '{"timestamp":"2024-01-01T00:00:00Z","level":"ERROR","message":"fail","service":"svc"}',
    ]
    const registry = new ParserRegistry(lines)
    const result = registry.parse(lines[0]!)
    expect(result?.level).toBe('ERROR')
  })
})
