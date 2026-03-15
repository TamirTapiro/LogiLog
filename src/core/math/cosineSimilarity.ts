/**
 * Cosine similarity for pre-normalized (L2) vectors.
 * For unit vectors, cosine similarity equals the dot product.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0)
  return dot
}

export function cosineDistance(a: Float32Array, b: Float32Array): number {
  return 1 - cosineSimilarity(a, b)
}

export function l2Normalize(v: Float32Array): void {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!
  const norm = Math.sqrt(sum)
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) v[i]! /= norm
  }
}

export function l2Distance(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    sum += diff * diff
  }
  return Math.sqrt(sum)
}
