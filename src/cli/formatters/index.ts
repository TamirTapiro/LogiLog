import type { Formatter } from './types'
import { terminalFormatter } from './terminal'
import { jsonFormatter } from './json'
import { markdownFormatter } from './markdown'
import { sarifFormatter } from './sarif'

export type { Formatter, FormatOptions } from './types'

const FORMATTERS: Record<string, Formatter> = {
  terminal: terminalFormatter,
  json: jsonFormatter,
  markdown: markdownFormatter,
  sarif: sarifFormatter,
}

export function getFormatter(format: string): Formatter {
  const formatter = FORMATTERS[format]
  if (!formatter) {
    throw new Error(`Unknown format "${format}". Valid options: ${Object.keys(FORMATTERS).join(', ')}`)
  }
  return formatter
}
