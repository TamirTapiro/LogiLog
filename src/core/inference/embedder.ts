/**
 * Embedder interface — implemented by both Node.js (onnxruntime-node) and
 * browser (WebGPU/WASM) backends.
 */
export interface Embedder {
  initialize(onProgress?: (percent: number) => void): Promise<void>
  embed(
    texts: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Float32Array[]>
  dispose(): void
}
