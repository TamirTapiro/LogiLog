import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  base: '/LogiLog/',
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    ...(process.env.ANALYZE ? [visualizer({ open: true, gzipSize: true, brotliSize: true })] : []),
  ],
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Inference chunk — loaded lazily from workers only, excluded from initial budget
          if (
            id.includes('@huggingface/transformers') ||
            id.includes('onnxruntime-web') ||
            id.includes('onnxruntime')
          ) {
            return 'inference'
          }
          // React vendor chunk
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react'
          }
          // UI vendor chunk — recharts, react-window, and their transitive deps (d3, etc.)
          if (
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/react-window') ||
            id.includes('node_modules/d3-') ||
            id.includes('node_modules/victory-') ||
            id.includes('node_modules/internmap') ||
            id.includes('node_modules/robust-predicates')
          ) {
            return 'vendor-ui'
          }
        },
      },
    },
  },
})
