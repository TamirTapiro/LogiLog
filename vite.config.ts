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
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['recharts', 'react-window'],
          inference: ['@huggingface/transformers', 'onnxruntime-web'],
        },
      },
    },
  },
})
