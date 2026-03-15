#!/usr/bin/env node
/**
 * logilog CLI — semantic log forensics
 *
 * Usage:
 *   logilog analyze <file> [options]
 *   logilog download-model [--cache-dir <path>]
 */

import { Command, InvalidArgumentError } from 'commander'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
// Resolve package version
let pkgVersion = '0.0.1'
try {
  // Look up from our own package.json
  const ownPkg = JSON.parse(
    fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
  ) as { version: string }
  pkgVersion = ownPkg.version
} catch {
  // ignore
}

const program = new Command()

program
  .name('logilog')
  .description(
    'Semantic log forensics: detect anomalies, cluster events, and generate AI narratives from any log file.',
  )
  .version(pkgVersion)

// ---- analyze subcommand ----

program
  .command('analyze <file>')
  .description('Analyze a log file and output a forensic report')
  .option('--format <type>', 'Output format: terminal, json, markdown, sarif', 'terminal')
  .option('--output <file>', 'Write report to file instead of stdout')
  .option('--top <n>', 'Show top N anomalies', parsePositiveInt, 10)
  .option('--threshold <n>', 'Anomaly threshold 0–1', parseFloat0to1, 0.35)
  .option('--context-window <n>', 'Lines of context before anomaly', parsePositiveInt, 75)
  .option('--ai', 'Enable AI forensics (requires ANTHROPIC_API_KEY env var)')
  .option(
    '--cache-dir <path>',
    'Model cache directory',
    path.join(os.homedir(), '.cache', 'logilog'),
  )
  .option('--no-cache', 'Skip cache, force re-download')
  .option('--parser <name>', 'Force parser: json, syslog, k8s, apache, nginx, generic')
  .option('--quiet', 'Suppress progress spinner')
  .action(async (file: string, opts: Record<string, unknown>) => {
    const format = opts['format'] as string
    const outputFile = opts['output'] as string | undefined
    const top = opts['top'] as number
    const threshold = opts['threshold'] as number
    const contextWindow = opts['contextWindow'] as number
    const aiEnabled = opts['ai'] as boolean
    const cacheDir = opts['cacheDir'] as string
    const quiet = opts['quiet'] as boolean

    // Validate file exists
    if (!fs.existsSync(file)) {
      process.stderr.write(`Error: File not found: ${file}\n`)
      process.exit(1)
    }

    // Validate format
    const validFormats = ['terminal', 'json', 'markdown', 'sarif']
    if (!validFormats.includes(format)) {
      process.stderr.write(
        `Error: Invalid format "${format}". Valid options: ${validFormats.join(', ')}\n`,
      )
      process.stderr.write(
        `Usage: logilog analyze <file> --format <terminal|json|markdown|sarif>\n`,
      )
      process.exit(2)
    }

    // Validate AI key if --ai flag used
    const anthropicApiKey = aiEnabled ? process.env['ANTHROPIC_API_KEY'] : undefined
    if (aiEnabled && !anthropicApiKey) {
      process.stderr.write(
        'Error: ANTHROPIC_API_KEY environment variable is required when using --ai\n',
      )
      process.exit(1)
    }

    // Set up spinner (only for non-JSON formats, goes to stderr)
    let spinner: {
      start(): void
      text: string
      succeed(text?: string): void
      fail(text?: string): void
      stop(): void
    } | null = null
    if (!quiet && format !== 'json') {
      try {
        const { default: ora } = await import('ora')
        spinner = ora({ stream: process.stderr, text: 'Analyzing...' })
      } catch {
        // ora not available — skip spinner
      }
    }

    try {
      // Dynamically import analyze to keep startup fast
      const { analyze } = await import('../core/pipeline.js')
      const { getFormatter } = await import('./formatters/index.js')

      let lastStage = ''
      spinner?.start()

      const report = await analyze({
        input: file,
        threshold,
        contextWindow,
        top,
        cacheDir,
        anthropicApiKey,
        onProgress: (stage, percent) => {
          if (spinner && stage !== lastStage) {
            lastStage = stage
            const labels: Record<string, string> = {
              parsing: 'Parsing log file...',
              embedding: 'Generating embeddings...',
              analyzing: 'Detecting anomalies...',
              done: 'Done',
            }
            spinner.text = labels[stage] ?? stage
          }
          void percent
        },
      })

      spinner?.succeed(`Analyzed ${report.meta.inputLines} lines in ${report.meta.durationMs}ms`)

      // Format report
      const formatter = getFormatter(format)
      const output = formatter(report, { verbose: false, filePath: file })

      // Write output
      if (outputFile) {
        fs.writeFileSync(outputFile, output, 'utf-8')
        if (!quiet) process.stderr.write(`Report written to ${outputFile}\n`)
      } else {
        process.stdout.write(output)
        if (!output.endsWith('\n')) process.stdout.write('\n')
      }

      process.exit(0)
    } catch (err) {
      spinner?.fail('Analysis failed')
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error: ${msg}\n`)
      process.exit(1)
    }
  })

// ---- download-model subcommand ----

program
  .command('download-model')
  .description('Pre-cache the embedding model (useful for Docker/CI setup)')
  .option(
    '--cache-dir <path>',
    'Model cache directory',
    path.join(os.homedir(), '.cache', 'logilog'),
  )
  .action(async (opts: { cacheDir: string }) => {
    const { cacheDir } = opts

    process.stderr.write(`Downloading model to ${cacheDir}...\n`)

    try {
      const { NodeEmbedder } = await import('../core/inference/node-embedder.js')
      const embedder = new NodeEmbedder(cacheDir)
      await embedder.initialize((percent) => {
        process.stderr.write(`\rProgress: ${percent.toFixed(1)}%   `)
      })
      process.stderr.write('\n')
      embedder.dispose()
      process.stderr.write(`Model cached at: ${cacheDir}\n`)
      process.exit(0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error: ${msg}\n`)
      process.exit(3)
    }
  })

program.parse(process.argv)

// ---- Argument validators ----

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < 1) throw new InvalidArgumentError('Must be a positive integer.')
  return n
}

function parseFloat0to1(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n) || n < 0 || n > 1)
    throw new InvalidArgumentError('Must be a number between 0 and 1.')
  return n
}
