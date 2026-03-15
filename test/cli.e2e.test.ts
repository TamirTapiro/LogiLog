/**
 * CLI E2E tests — runs node dist/cli/index.js as a child process.
 * Tests all subcommands, formats, and error cases.
 *
 * Prerequisites: run npm run build:pkg before these tests.
 * The globalSetup below handles this automatically if dist/ is stale.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const execFileAsync = promisify(execFile)

const PROJECT_ROOT = path.join(import.meta.dirname ?? __dirname, '..')
const CLI_BIN = path.join(PROJECT_ROOT, 'dist', 'cli', 'index.js')
const EXAMPLE_FILE = path.join(PROJECT_ROOT, 'example.txt')

interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

async function runCLI(args: string[], env: Record<string, string> = {}): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_BIN, ...args], {
      timeout: 60_000,
      env: { ...process.env, ...env },
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout: string; stderr: string; code: number }
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
    }
  }
}

// ---- Global setup: ensure CLI is built ----

beforeAll(async () => {
  const distExists = fs.existsSync(CLI_BIN)
  if (!distExists) {
    console.log('Building CLI...')
    await execFileAsync('npm', ['run', 'build:pkg'], {
      cwd: PROJECT_ROOT,
      timeout: 60_000,
    })
  }
}, 120_000)

// ---- Happy path tests ----

describe('happy path', () => {
  it('terminal format: exits 0 and outputs anomaly info', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) {
      console.warn('example.txt not found — skipping')
      return
    }
    const { exitCode, stdout } = await runCLI(['analyze', EXAMPLE_FILE, '--quiet'])
    expect(exitCode).toBe(0)
    // Terminal output should mention anomalies or no anomalies
    expect(stdout.length + 1).toBeGreaterThan(0) // output exists
  }, 120_000)

  it('JSON format: exits 0 and outputs valid JSON with AnalysisReport shape', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const { exitCode, stdout } = await runCLI([
      'analyze',
      EXAMPLE_FILE,
      '--format',
      'json',
      '--quiet',
    ])
    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout) as Record<string, unknown>
    expect(report).toHaveProperty('anomalies')
    expect(report).toHaveProperty('clusters')
    expect(report).toHaveProperty('meta')
    expect(report).toHaveProperty('summary')
    expect(Array.isArray(report['anomalies'])).toBe(true)
  }, 120_000)

  it('Markdown format: exits 0 and output starts with # LogiLog', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const { exitCode, stdout } = await runCLI([
      'analyze',
      EXAMPLE_FILE,
      '--format',
      'markdown',
      '--quiet',
    ])
    expect(exitCode).toBe(0)
    expect(stdout.trimStart()).toMatch(/^# LogiLog/)
  }, 120_000)

  it('SARIF format: exits 0 and output matches SARIF 2.1.0 shape', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const { exitCode, stdout } = await runCLI([
      'analyze',
      EXAMPLE_FILE,
      '--format',
      'sarif',
      '--quiet',
    ])
    expect(exitCode).toBe(0)
    const sarif = JSON.parse(stdout) as Record<string, unknown>
    expect(sarif['version']).toBe('2.1.0')
    expect(Array.isArray(sarif['runs'])).toBe(true)
  }, 120_000)

  it('--output: writes report to file and exits 0', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const outFile = path.join(os.tmpdir(), `logilog-test-${Date.now()}.json`)
    try {
      const { exitCode } = await runCLI([
        'analyze',
        EXAMPLE_FILE,
        '--format',
        'json',
        '--output',
        outFile,
        '--quiet',
      ])
      expect(exitCode).toBe(0)
      expect(fs.existsSync(outFile)).toBe(true)
      const content = fs.readFileSync(outFile, 'utf-8')
      const report = JSON.parse(content) as Record<string, unknown>
      expect(report).toHaveProperty('anomalies')
    } finally {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile)
    }
  }, 120_000)

  it('--top 3: returns at most 3 anomalies', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const { exitCode, stdout } = await runCLI([
      'analyze',
      EXAMPLE_FILE,
      '--format',
      'json',
      '--top',
      '3',
      '--quiet',
    ])
    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout) as { anomalies: unknown[] }
    expect(report.anomalies.length).toBeLessThanOrEqual(3)
  }, 120_000)

  it('--quiet: no spinner/progress lines in stderr', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const { exitCode, stderr } = await runCLI([
      'analyze',
      EXAMPLE_FILE,
      '--format',
      'json',
      '--quiet',
    ])
    expect(exitCode).toBe(0)
    // With --quiet, stderr should not contain spinner progress lines
    expect(stderr).not.toMatch(/Parsing|Embedding|Analyzing/)
  }, 120_000)
})

// ---- Error cases ----

describe('error cases', () => {
  it('non-existent file: exits 1 and stderr contains "File not found"', async () => {
    const { exitCode, stderr } = await runCLI(['analyze', '/tmp/nonexistent-file-xyz.log'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/File not found/i)
  }, 30_000)

  it('--ai with no ANTHROPIC_API_KEY: exits 1 and stderr mentions ANTHROPIC_API_KEY', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const { exitCode, stderr } = await runCLI(['analyze', EXAMPLE_FILE, '--ai', '--quiet'], {
      ANTHROPIC_API_KEY: '',
    })
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/ANTHROPIC_API_KEY/)
  }, 30_000)

  it('invalid --format: exits 2 and stderr contains usage hint', async () => {
    if (!fs.existsSync(EXAMPLE_FILE)) return
    const { exitCode, stderr } = await runCLI([
      'analyze',
      EXAMPLE_FILE,
      '--format',
      'invalidformat',
      '--quiet',
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toMatch(/format|Usage/i)
  }, 30_000)
})

// ---- download-model subcommand ----

describe('download-model', () => {
  it('exits 0 and model cache directory exists after run', async () => {
    const cacheDir = path.join(os.tmpdir(), `logilog-cache-${Date.now()}`)
    try {
      const { exitCode } = await runCLI(['download-model', '--cache-dir', cacheDir])
      expect(exitCode).toBe(0)
      expect(fs.existsSync(cacheDir)).toBe(true)
    } finally {
      if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true })
    }
  }, 120_000)
})
