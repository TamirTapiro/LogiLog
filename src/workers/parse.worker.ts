import * as Comlink from 'comlink'
import { ParserRegistry } from './parsers/registry'
import type { ParseWorkerOutput } from './worker.types'

const BATCH_SIZE = 500
const SAMPLE_SIZE = 20

// Alias consumed by useParseWorker hook
export type ParseWorker = ParseWorkerAPI

export interface ParseWorkerAPI {
  parseFile(file: File, onBatch: (output: ParseWorkerOutput) => void): Promise<void>
  cancel(): void
}

let _cancelled = false

const worker: ParseWorkerAPI = {
  cancel() {
    _cancelled = true
  },

  async parseFile(file, onBatch) {
    _cancelled = false
    let id = 0
    let byteOffset = 0
    let parsedLines = 0
    const batchEntries: ParseWorkerOutput['entries'] = []

    // --- Phase 1: collect first SAMPLE_SIZE lines for format detection ---
    const sampleLines: string[] = []
    let sampleBuffer = ''
    const sampleReader = file.stream().getReader()
    const sampleDecoder = new TextDecoder()
    let sampleDone = false

    while (sampleLines.length < SAMPLE_SIZE && !sampleDone) {
      const { done, value } = await sampleReader.read()
      if (done) {
        sampleDone = true
        break
      }
      sampleBuffer += sampleDecoder.decode(value, { stream: true })
      const newline = sampleBuffer.lastIndexOf('\n')
      if (newline === -1) continue
      const lines = sampleBuffer.slice(0, newline).split('\n')
      sampleBuffer = sampleBuffer.slice(newline + 1)
      for (const l of lines) {
        if (l.trim()) sampleLines.push(l)
        if (sampleLines.length >= SAMPLE_SIZE) break
      }
    }
    sampleReader.cancel()

    const registry = new ParserRegistry(sampleLines)

    // --- Phase 2: full streaming parse ---
    const reader = file.stream().getReader()
    const decoder = new TextDecoder()
    let remainder = ''

    while (true) {
      if (_cancelled) {
        reader.cancel()
        return
      }
      const { done, value } = await reader.read()
      if (done) break

      remainder += decoder.decode(value, { stream: true })
      const newline = remainder.lastIndexOf('\n')
      if (newline === -1) continue

      const chunk = remainder.slice(0, newline)
      remainder = remainder.slice(newline + 1)
      const lines = chunk.split('\n')

      for (const raw of lines) {
        if (_cancelled) {
          reader.cancel()
          return
        }
        const lineBytes = new TextEncoder().encode(raw + '\n').byteLength

        if (!raw.trim()) {
          byteOffset += lineBytes
          continue
        }

        const parsed = registry.parse(raw)
        if (!parsed) {
          byteOffset += lineBytes
          continue
        }

        batchEntries!.push({
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

        if (batchEntries!.length >= BATCH_SIZE) {
          onBatch({
            type: 'batch',
            entries: [...batchEntries!],
            totalParsed: parsedLines,
            done: false,
          })
          batchEntries!.length = 0
        }
      }
    }

    // Flush remaining
    if (batchEntries!.length > 0) {
      onBatch({ type: 'batch', entries: [...batchEntries!], totalParsed: parsedLines, done: false })
    }
    onBatch({ type: 'done', totalParsed: parsedLines, done: true })
  },
}

Comlink.expose(worker)
