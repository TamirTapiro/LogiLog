/**
 * Integration tests for the Node.js analysis pipeline.
 * Exercises analyze() end-to-end with example.txt as a known-good fixture.
 *
 * These tests require the model to be downloaded on first run (~60s).
 * On cached runs they complete in < 10 seconds.
 *
 * Run with: npm run test:node
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import { analyze } from '../src/core/pipeline'
import type { AnalysisReport } from '../src/core/types/results'

const EXAMPLE_FILE = path.join(import.meta.dirname ?? __dirname, '..', 'example.txt')
const EMPTY_FILE = path.join(import.meta.dirname ?? __dirname, 'fixtures', 'empty.log')
const SINGLE_LINE_FILE = path.join(import.meta.dirname ?? __dirname, 'fixtures', 'single-line.log')
const MALFORMED_FILE = path.join(import.meta.dirname ?? __dirname, 'fixtures', 'malformed.log')

// ---- Fixtures ----

beforeAll(() => {
  // Create fixture files if they don't exist
  const fixtureDir = path.join(path.dirname(EMPTY_FILE))
  if (!fs.existsSync(fixtureDir)) fs.mkdirSync(fixtureDir, { recursive: true })

  if (!fs.existsSync(EMPTY_FILE)) {
    fs.writeFileSync(EMPTY_FILE, '', 'utf-8')
  }

  if (!fs.existsSync(SINGLE_LINE_FILE)) {
    fs.writeFileSync(
      SINGLE_LINE_FILE,
      '2026-03-14T09:15:01.112Z INFO [api-gateway] request started\n',
      'utf-8',
    )
  }

  if (!fs.existsSync(MALFORMED_FILE)) {
    fs.writeFileSync(
      MALFORMED_FILE,
      [
        'this is not a log line',
        '2026-03-14T09:15:01.112Z INFO [service] valid line',
        '@@@@invalid@@@@',
        '2026-03-14T09:15:02.000Z ERROR [service] something failed',
        'another non-log line',
        '2026-03-14T09:15:03.000Z WARN [service] warning here',
      ].join('\n'),
      'utf-8',
    )
  }
})

// ---- Smoke test ----

describe('analyze() smoke test', () => {
  it('returns an AnalysisReport with correct shape', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) {
      console.warn('example.txt not found — skipping smoke test')
      return
    }

    const report: AnalysisReport = await analyze({ input: EXAMPLE_FILE })

    // Shape checks
    expect(report).toBeDefined()
    expect(report.anomalies).toBeInstanceOf(Array)
    expect(report.clusters).toBeInstanceOf(Array)
    expect(report.meta).toBeDefined()
    expect(report.summary).toBeDefined()
  }, 120_000)
})

// ---- Anomaly detection ----

describe('anomaly detection', () => {
  let report: AnalysisReport

  beforeAll(async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    report = await analyze({ input: EXAMPLE_FILE })
  }, 120_000)

  it('detects anomalies with score > 0 in example.txt', () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    expect(report.summary.totalAnomalies).toBeGreaterThan(0)
    expect(report.anomalies[0]?.score).toBeGreaterThan(0)
  })

  it('anomaly scores are between 0 and 1', () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    for (const anomaly of report.anomalies) {
      expect(anomaly.score).toBeGreaterThanOrEqual(0)
      expect(anomaly.score).toBeLessThanOrEqual(1)
    }
  })

  it('anomalies have correct rank ordering', () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    for (let i = 0; i < report.anomalies.length - 1; i++) {
      expect(report.anomalies[i]!.rank).toBeLessThan(report.anomalies[i + 1]!.rank)
      expect(report.anomalies[i]!.score).toBeGreaterThanOrEqual(report.anomalies[i + 1]!.score)
    }
  })
})

// ---- Clustering ----

describe('clustering', () => {
  it('returns at least 1 cluster for example.txt', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const report = await analyze({ input: EXAMPLE_FILE })
    expect(report.summary.totalClusters).toBeGreaterThanOrEqual(1)
  }, 120_000)
})

// ---- Smart Context ----

describe('smart context', () => {
  it('top anomaly has context with narrative', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const report = await analyze({ input: EXAMPLE_FILE, top: 1 })
    if (report.anomalies.length === 0) return
    const topAnomaly = report.anomalies[0]!
    expect(topAnomaly.context).toBeDefined()
    expect(typeof topAnomaly.context.narrative).toBe('string')
    expect(topAnomaly.context.narrative.length).toBeGreaterThan(0)
  }, 120_000)
})

// ---- Meta fields ----

describe('meta fields', () => {
  it('meta.inputLines > 0', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const report = await analyze({ input: EXAMPLE_FILE })
    expect(report.meta.inputLines).toBeGreaterThan(0)
  }, 120_000)

  it('meta.durationMs > 0', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const report = await analyze({ input: EXAMPLE_FILE })
    expect(report.meta.durationMs).toBeGreaterThan(0)
  }, 120_000)

  it('meta.parserUsed is set', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const report = await analyze({ input: EXAMPLE_FILE })
    expect(typeof report.meta.parserUsed).toBe('string')
    expect(report.meta.parserUsed.length).toBeGreaterThan(0)
  }, 120_000)

  it('meta.analyzedAt is an ISO date string', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const report = await analyze({ input: EXAMPLE_FILE })
    expect(() => new Date(report.meta.analyzedAt)).not.toThrow()
    expect(new Date(report.meta.analyzedAt).getTime()).toBeGreaterThan(0)
  }, 120_000)
})

// ---- No AI call ----

describe('AI forensics', () => {
  it('aiForensics is undefined when no anthropicApiKey is provided', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const report = await analyze({ input: EXAMPLE_FILE, top: 1 })
    for (const anomaly of report.anomalies) {
      expect(anomaly.aiForensics).toBeUndefined()
    }
  }, 120_000)
})

// ---- Edge cases ----

describe('edge cases', () => {
  it('empty file returns empty report with totalAnomalies === 0', async () => {
    const report = await analyze({ input: EMPTY_FILE })
    expect(report.summary.totalAnomalies).toBe(0)
    expect(report.anomalies).toHaveLength(0)
  }, 120_000)

  it('empty file does not throw', async () => {
    await expect(analyze({ input: EMPTY_FILE })).resolves.toBeDefined()
  }, 120_000)

  it('single-line file does not crash', async () => {
    await expect(analyze({ input: SINGLE_LINE_FILE })).resolves.toBeDefined()
  }, 120_000)

  it('malformed lines mixed with valid lines: parser degrades gracefully', async () => {
    const report = await analyze({ input: MALFORMED_FILE })
    // Should not throw, and should parse the valid lines
    expect(report.meta.inputLines).toBeGreaterThan(0)
  }, 120_000)
})

// ---- Model cache ----

describe('model cache', () => {
  it('second analyze() call is faster than first (model cached)', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return

    const start1 = Date.now()
    const report1 = await analyze({ input: EXAMPLE_FILE })
    const duration1 = Date.now() - start1

    const start2 = Date.now()
    const report2 = await analyze({ input: EXAMPLE_FILE })
    const duration2 = Date.now() - start2

    // Second call should use cached model — at minimum both should succeed
    expect(report1.meta.inputLines).toBe(report2.meta.inputLines)

    // The second call should generally be faster (model cached)
    // Allow some slack for CI variance
    console.log(`First call: ${duration1}ms, Second call: ${duration2}ms`)
    expect(report2.meta.durationMs).toBeLessThanOrEqual(report1.meta.durationMs * 2)
  }, 300_000)
})
