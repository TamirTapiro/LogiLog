import type { LogParser, ParsedEntry } from '../../lib/logParser'
import { SyslogParser } from './syslog'
import { JsonParser } from './json'
import { ApacheCombinedParser } from './apache'
import { NginxParser } from './nginx'
import { K8sParser } from './k8s'
import { GenericTimestampParser } from './generic'

const REGISTRY: LogParser[] = [
  JsonParser,
  K8sParser,
  SyslogParser,
  ApacheCombinedParser,
  NginxParser,
  GenericTimestampParser,
]

export class ParserRegistry {
  private selectedParser: LogParser

  constructor(sampleLines: string[]) {
    const sample = sampleLines.slice(0, 20).filter((l) => l.trim().length > 0)
    this.selectedParser = this.detectParser(sample)
  }

  private detectParser(sampleLines: string[]): LogParser {
    let best: LogParser = GenericTimestampParser
    let bestScore = 0

    for (const parser of REGISTRY) {
      const score = parser.confidence(sampleLines)
      if (score > bestScore) {
        bestScore = score
        best = parser
      }
    }

    return best
  }

  get parserName(): string {
    return this.selectedParser.name
  }

  parse(line: string): ParsedEntry | null {
    return this.selectedParser.parse(line)
  }
}
