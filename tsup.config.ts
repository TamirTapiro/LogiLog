import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/core/index.ts',
    'cli/index': 'src/cli/index.ts',
    'reporters/vitest': 'src/reporters/vitest.ts',
    'reporters/jest': 'src/reporters/jest.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  outDir: 'dist',
  exclude: ['node_modules', 'src/web/**'],
  external: [
    // peer deps
    'vitest',
    'jest',
    'onnxruntime-node',
    // browser-only deps that should never be bundled for Node
    'comlink',
    'idb',
    'fflate',
    'browser-fs-access',
  ],
})
