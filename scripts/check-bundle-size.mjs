#!/usr/bin/env node
/**
 * Bundle size budget enforcement.
 *
 * Reads the Rollup stats from dist/ and fails the build if any chunk
 * exceeds its defined limit. Also writes bundle-report.json for the
 * CI PR comment job.
 */

import { readdirSync, statSync, writeFileSync } from 'fs'
import { resolve, extname } from 'path'
import { createReadStream } from 'fs'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Writable } from 'stream'

const DIST_JS = resolve('dist/assets')

// Budgets in bytes.
const BUDGETS = {
  'vendor-react': { raw: 150 * 1024, gzip: 50 * 1024 },
  'vendor-ui': { raw: 400 * 1024, gzip: 120 * 1024 },
  main: { raw: 200 * 1024, gzip: 60 * 1024 },
  // inference is excluded from hard limits (lazy-loaded, large by design).
}

// Total initial JS budget (sum of all non-inference chunks).
const TOTAL_INITIAL_BUDGET = { raw: 500 * 1024, gzip: 200 * 1024 }

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function gzipSize(filePath) {
  let size = 0
  const counter = new Writable({
    write(chunk, _enc, cb) {
      size += chunk.length
      cb()
    },
  })
  await pipeline(createReadStream(filePath), createGzip(), counter)
  return size
}

const files = readdirSync(DIST_JS).filter((f) => extname(f) === '.js')

const chunks = []
let totalRaw = 0
let totalGzip = 0
let failed = false

for (const file of files) {
  const filePath = resolve(DIST_JS, file)
  const rawSize = statSync(filePath).size
  const gzSize = await gzipSize(filePath)

  // Identify which named chunk this file belongs to by matching the
  // name prefix (before the content hash).
  const chunkName = Object.keys(BUDGETS).find((name) => file.startsWith(name))

  const budget = BUDGETS[chunkName]
  let status = 'ok'

  if (budget) {
    if (rawSize > budget.raw) {
      console.error(
        `BUDGET EXCEEDED: ${file} raw size ${formatBytes(rawSize)} > limit ${formatBytes(budget.raw)}`,
      )
      status = 'exceeded'
      failed = true
    } else if (gzSize > budget.gzip) {
      console.error(
        `BUDGET EXCEEDED: ${file} gzip size ${formatBytes(gzSize)} > limit ${formatBytes(budget.gzip)}`,
      )
      status = 'exceeded'
      failed = true
    }
  }

  const isInitial = chunkName !== undefined && chunkName !== 'inference'
  if (isInitial) {
    totalRaw += rawSize
    totalGzip += gzSize
  }

  chunks.push({
    name: file,
    rawSize,
    gzipSize: gzSize,
    sizePretty: formatBytes(rawSize),
    gzipPretty: formatBytes(gzSize),
    status,
  })
}

// Check total initial JS budget.
if (totalRaw > TOTAL_INITIAL_BUDGET.raw) {
  console.error(
    `BUDGET EXCEEDED: Total initial JS ${formatBytes(totalRaw)} > limit ${formatBytes(TOTAL_INITIAL_BUDGET.raw)}`,
  )
  failed = true
}

if (totalGzip > TOTAL_INITIAL_BUDGET.gzip) {
  console.error(
    `BUDGET EXCEEDED: Total initial JS gzip ${formatBytes(totalGzip)} > limit ${formatBytes(TOTAL_INITIAL_BUDGET.gzip)}`,
  )
  failed = true
}

const report = {
  chunks,
  totalJsPretty: formatBytes(totalRaw),
  totalJsGzipPretty: formatBytes(totalGzip),
  passed: !failed,
}

writeFileSync('bundle-report.json', JSON.stringify(report, null, 2))
console.log('\nBundle report written to bundle-report.json')

if (failed) {
  console.error('\nBundle size check FAILED. See errors above.')
  process.exit(1)
} else {
  console.log(
    `\nBundle size check PASSED. Total initial JS: ${formatBytes(totalRaw)} (gzip: ${formatBytes(totalGzip)})`,
  )
}
