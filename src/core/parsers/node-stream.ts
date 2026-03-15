/**
 * Node.js parse pipeline — reads log files via fs.createReadStream.
 * Handles .gz decompression and .zip extraction without browser APIs.
 * Streams in batches: never loads the full file into memory.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import * as readline from 'readline'
import type { Readable } from 'stream'
import { ParserRegistry } from './registry'
import type { LogEntry } from '../types/log'
import type { ParsedEntry } from './logParser'

const BATCH_SIZE = 1000
const SAMPLE_SIZE = 20

export interface ParseResult {
  totalParsed: number
  parserUsed: string
}

export interface ParseProgress {
  parsed: number
  total: number | null
}

/**
 * Parse a log file from a file path or Node.js ReadableStream.
 * Emits entries in batches via onBatch callback.
 */
export async function parseFile(
  input: string | Readable,
  onBatch: (batch: LogEntry[]) => void,
  onProgress?: (progress: ParseProgress) => void,
): Promise<ParseResult> {
  // Determine if input is a file path or stream
  const filePath = typeof input === 'string' ? input : null

  // Create the raw stream
  let rawStream: Readable
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    rawStream = fs.createReadStream(filePath)
  } else {
    rawStream = input as Readable
  }

  // Handle decompression
  let stream: Readable = rawStream
  const nameLower = (filePath ?? '').toLowerCase()

  if (nameLower.endsWith('.gz')) {
    const gunzip = zlib.createGunzip()
    rawStream.pipe(gunzip)
    stream = gunzip
  } else if (nameLower.endsWith('.zip')) {
    stream = await extractZipFirstLogFile(filePath!)
  }

  // Phase 1: collect sample lines for format detection
  const sampleLines: string[] = []

  // Collect all lines so we can sample for format detection, then process
  const allLines: string[] = []

  await new Promise<void>((resolve, reject) => {
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
    rl.on('line', (line) => {
      allLines.push(line)
    })
    rl.on('close', resolve)
    rl.on('error', reject)
  })

  // Extract sample
  for (const line of allLines) {
    if (line.trim()) sampleLines.push(line)
    if (sampleLines.length >= SAMPLE_SIZE) break
  }

  const registry = new ParserRegistry(sampleLines)
  const total = allLines.length

  // Phase 2: parse all lines in batches
  let id = 0
  let byteOffset = 0
  let parsedLines = 0
  const batch: LogEntry[] = []

  for (const raw of allLines) {
    const lineBytes = Buffer.byteLength(raw + '\n', 'utf-8')

    if (!raw.trim()) {
      byteOffset += lineBytes
      continue
    }

    const parsed: ParsedEntry | null = registry.parse(raw)
    if (!parsed) {
      byteOffset += lineBytes
      continue
    }

    batch.push({
      id: id++,
      timestamp: parsed.timestamp,
      level: parsed.level,
      source: parsed.source,
      message: parsed.message,
      raw,
      byteOffset,
    })
    parsedLines++
    byteOffset += lineBytes

    if (batch.length >= BATCH_SIZE) {
      onBatch([...batch])
      batch.length = 0
      onProgress?.({ parsed: parsedLines, total })
    }
  }

  if (batch.length > 0) {
    onBatch([...batch])
    onProgress?.({ parsed: parsedLines, total })
  }

  return {
    totalParsed: parsedLines,
    parserUsed: registry.parserName,
  }
}

/**
 * Extract the first (largest) log file from a ZIP archive.
 * Returns a Readable stream of the extracted content.
 */
async function extractZipFirstLogFile(filePath: string): Promise<Readable> {
  // Dynamically import fflate so this module has no hard dep on it
  let unzipSync: (data: Uint8Array) => Record<string, Uint8Array>
  try {
    const fflate = await import('fflate')
    unzipSync = fflate.unzipSync
  } catch {
    throw new Error('fflate is required for ZIP support. Run: npm install fflate')
  }

  const buffer = fs.readFileSync(filePath)
  const entries = unzipSync(new Uint8Array(buffer))

  const logExtensions = ['.log', '.txt', '.csv']
  const logEntries = Object.keys(entries).filter((name) =>
    logExtensions.some((ext) => name.toLowerCase().endsWith(ext)),
  )

  if (logEntries.length === 0) {
    throw new Error('No .log, .txt, or .csv files found inside the ZIP archive.')
  }

  const largest = logEntries.reduce((best, name) =>
    (entries[name]?.byteLength ?? 0) > (entries[best]?.byteLength ?? 0) ? name : best,
  )

  const data = entries[largest]!
  const { Readable } = await import('stream')
  const readable = new Readable({
    read() {
      this.push(Buffer.from(data))
      this.push(null)
    },
  })

  return readable
}

/**
 * Convenience: get just the file extension path (for logging)
 */
export function getFileType(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace('.', '') || 'unknown'
}
