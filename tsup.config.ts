import { defineConfig } from 'tsup'

const sharedExternal = [
  // peer deps
  'vitest',
  'jest',
  'onnxruntime-node',
  // browser-only deps that should never be bundled for Node
  'comlink',
  'idb',
  'fflate',
  'browser-fs-access',
]

export default defineConfig([
  // ── Library entries (index + reporters) — with .d.ts ──
  {
    entry: {
      index: 'src/core/index.ts',
      'reporters/vitest': 'src/reporters/vitest.ts',
      'reporters/jest': 'src/reporters/jest.ts',
    },
    format: ['esm', 'cjs'],
    dts: { tsconfig: './tsconfig.build.json' },
    clean: true,
    splitting: false,
    sourcemap: false,
    outDir: 'dist',
    external: sharedExternal,
  },
  // ── CLI entry — no .d.ts needed (it's an executable) ──
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: false,
    outDir: 'dist',
    external: sharedExternal,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
