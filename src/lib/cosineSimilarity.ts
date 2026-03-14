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
