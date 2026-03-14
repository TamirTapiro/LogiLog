import * as Comlink from 'comlink'
import type { AnomalyResult, ClusterResult } from '../types/analysis.types'
import { cosineDistance, cosineSimilarity } from '../lib/cosineSimilarity'

// ---- Anomaly detection ----

const ANOMALY_WINDOW_SIZE = 50
const ANOMALY_THRESHOLD = 0.35

function scoreAnomalies(embeddings: Float32Array[], logIds: number[]): AnomalyResult[] {
  const anomalies: AnomalyResult[] = []
  const window: Float32Array[] = []

  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i]!
    const logId = logIds[i]!

    if (window.length >= ANOMALY_WINDOW_SIZE) {
      window.shift()
    }
    window.push(embedding)

    if (window.length < 2) continue

    // Compute centroid of the sliding window
    const dim = embedding.length
    const centroid = new Float32Array(dim)
    for (const vec of window) {
      for (let d = 0; d < dim; d++) centroid[d]! += vec[d] ?? 0
    }
    for (let d = 0; d < dim; d++) centroid[d]! /= window.length

    const dist = cosineDistance(embedding, centroid)
    if (dist > ANOMALY_THRESHOLD) {
      anomalies.push({ logId, score: dist, rank: 0 })
    }
  }

  // Sort by score descending and assign rank
  anomalies.sort((a, b) => b.score - a.score)
  for (let i = 0; i < anomalies.length; i++) {
    anomalies[i]!.rank = i + 1
  }

  return anomalies
}

// ---- K-means clustering ----

const DEFAULT_K = 20
const MAX_ITERATIONS = 50
const CONVERGENCE_THRESHOLD = 0.01

function cluster(
  embeddings: Float32Array[],
  logIds: number[],
  messages: string[],
): ClusterResult[] {
  const n = embeddings.length
  if (n === 0) return []

  const k = Math.min(DEFAULT_K, Math.ceil(Math.sqrt(n / 2)))

  // K-means++ initialization
  const centroids = kMeansPlusPlus(embeddings, k)

  let assignments = new Int32Array(n).fill(-1)

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Assign each embedding to nearest centroid
    const newAssignments = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      let bestCluster = 0
      let bestSim = -Infinity
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSimilarity(embeddings[i]!, centroids[c]!)
        if (sim > bestSim) {
          bestSim = sim
          bestCluster = c
        }
      }
      newAssignments[i] = bestCluster
    }

    // Update centroids
    const dim = embeddings[0]!.length
    const newCentroids: Float32Array[] = Array.from({ length: k }, () => new Float32Array(dim))
    const counts = new Int32Array(k)

    for (let i = 0; i < n; i++) {
      const c = newAssignments[i]!
      counts[c]!++
      for (let d = 0; d < dim; d++) {
        newCentroids[c]![d]! += embeddings[i]![d] ?? 0
      }
    }

    let maxShift = 0
    for (let c = 0; c < k; c++) {
      if (counts[c]! > 0) {
        for (let d = 0; d < dim; d++) newCentroids[c]![d]! /= counts[c]!
        const shift = l2Distance(centroids[c]!, newCentroids[c]!)
        if (shift > maxShift) maxShift = shift
        centroids[c] = newCentroids[c]!
      }
    }

    assignments = newAssignments

    if (maxShift < CONVERGENCE_THRESHOLD) break
  }

  // Build cluster results
  const memberMap = new Map<number, number[]>()
  const messageMap = new Map<number, string[]>()
  for (let i = 0; i < n; i++) {
    const c = assignments[i]!
    if (!memberMap.has(c)) {
      memberMap.set(c, [])
      messageMap.set(c, [])
    }
    memberMap.get(c)!.push(logIds[i]!)
    messageMap.get(c)!.push(messages[i]!)
  }

  const results: ClusterResult[] = []
  for (const [clusterId, memberIds] of memberMap) {
    const clusterMessages = messageMap.get(clusterId) ?? []
    const label = extractLabel(clusterMessages)
    results.push({
      clusterId,
      label,
      memberIds,
      centroid: centroids[clusterId]!,
      size: memberIds.length,
    })
  }

  // Sort by size descending
  results.sort((a, b) => b.size - a.size)
  return results
}

function kMeansPlusPlus(embeddings: Float32Array[], k: number): Float32Array[] {
  const n = embeddings.length
  const centroids: Float32Array[] = []

  // Pick first centroid at random
  const firstIdx = Math.floor(Math.random() * n)
  centroids.push(embeddings[firstIdx]!)

  for (let c = 1; c < k; c++) {
    // Compute distance from each point to nearest centroid
    const distances = new Float64Array(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      let minDist = Infinity
      for (const centroid of centroids) {
        const d = 1 - cosineSimilarity(embeddings[i]!, centroid)
        if (d < minDist) minDist = d
      }
      distances[i] = minDist * minDist
      total += distances[i]!
    }

    // Sample next centroid proportional to distance squared
    let threshold = Math.random() * total
    for (let i = 0; i < n; i++) {
      threshold -= distances[i]!
      if (threshold <= 0) {
        centroids.push(embeddings[i]!)
        break
      }
    }
    // Fallback in case of floating point issues
    if (centroids.length <= c) centroids.push(embeddings[Math.floor(Math.random() * n)]!)
  }

  return centroids
}

function l2Distance(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

/** Extract a label from cluster messages using most frequent 3-gram */
function extractLabel(messages: string[]): string {
  const counts = new Map<string, number>()
  for (const msg of messages) {
    const words = msg
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`
      counts.set(trigram, (counts.get(trigram) ?? 0) + 1)
    }
  }
  if (counts.size === 0) return 'Unknown'
  let best = ''
  let bestCount = 0
  for (const [trigram, count] of counts) {
    if (count > bestCount) {
      best = trigram
      bestCount = count
    }
  }
  return best || 'Unknown'
}

// ---- Comlink-exposed worker ----

// Alias consumed by useAnalysisWorker hook
export type AnalysisWorker = AnalysisWorkerAPI

export interface AnalysisWorkerAPI {
  scoreAnomalies(embeddings: Float32Array[], logIds: number[]): AnomalyResult[]
  cluster(embeddings: Float32Array[], logIds: number[], messages: string[]): ClusterResult[]
}

const analysisWorker: AnalysisWorkerAPI = {
  scoreAnomalies,
  cluster,
}

Comlink.expose(analysisWorker)
