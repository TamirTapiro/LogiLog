/**
 * Vitest config for Node.js integration tests.
 * These tests run the actual analyze() pipeline with real model inference.
 *
 * Usage:
 *   npm run test:node          -- node-pipeline.test.ts (integration)
 *   npm run test:cli           -- cli.e2e.test.ts (CLI E2E, requires build:pkg)
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Node.js integration tests can take longer due to model download
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
