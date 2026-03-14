import * as Comlink from 'comlink'
import type {
  WorkerLogEntry,
  LogLevel,
  ParseWorkerOutput,
} from './worker.types'

export interface ParseWorker {
  parseBuffer(
    buffer: ArrayBuffer,
    fileName: string,
    onBatch: (output: ParseWorkerOutput) => void,
  ): Promise<void>
}

// Minimal log-level detection heuristic
function detectLevel(line: string): LogLevel {
  const upper = line.toUpperCase()
  if (upper.includes('FATAL')) return 'FATAL'
  if (upper.includes('ERROR')) return 'ERROR'
  if (upper.includes('WARN')) return 'WARN'
  if (upper.includes('INFO')) return 'INFO'
  if (upper.includes('DEBUG')) return 'DEBUG'
  if (upper.includes('TRACE')) return 'TRACE'
  return 'UNKNOWN'
}

const worker: ParseWorker = {
  async parseBuffer(buffer, _fileName, onBatch) {
    const BATCH_SIZE = 500
    const decoder = new TextDecoder()
    const text = decoder.decode(buffer)
    const lines = text.split('\n')
    const entries: WorkerLogEntry[] = []
    let byteOffset = 0
    let id = 0

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? ''
      if (raw.trim().length === 0) {
        byteOffset += new TextEncoder().encode(raw + '\n').byteLength
        continue
      }

      entries.push({
        id: id++,
        timestamp: Date.now() + i,
        level: detectLevel(raw),
        source: _fileName,
        message: raw.slice(0, 200),
        raw,
        byteOffset,
      })

      byteOffset += new TextEncoder().encode(raw + '\n').byteLength

      if (entries.length >= BATCH_SIZE) {
        onBatch({ type: 'batch', entries: [...entries], totalParsed: id, done: false })
        entries.length = 0
      }
    }

    if (entries.length > 0) {
      onBatch({ type: 'batch', entries: [...entries], totalParsed: id, done: false })
    }

    onBatch({ type: 'done', totalParsed: id, done: true })
  },
}

Comlink.expose(worker)
