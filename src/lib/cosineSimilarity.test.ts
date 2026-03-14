import { describe, it, expect } from 'vitest'
import { cosineSimilarity, cosineDistance } from './cosineSimilarity'

describe('cosineSimilarity', () => {
  it('identical unit vectors → returns 1.0', () => {
    const v = new Float32Array([1, 0, 0])
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 6)
  })

  it('orthogonal unit vectors → returns 0.0', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([0, 1])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 6)
  })

  it('opposite unit vectors → returns -1.0', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([-1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 6)
  })

  it('[1/√2, 1/√2] · [1, 0] ≈ 0.7071', () => {
    const s = Math.SQRT1_2
    const a = new Float32Array([s, s])
    const b = new Float32Array([1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.7071, 4)
  })

  it('zero vector → does not throw (may return NaN or 0)', () => {
    const zero = new Float32Array([0, 0, 0])
    const unit = new Float32Array([1, 0, 0])
    expect(() => cosineSimilarity(zero, unit)).not.toThrow()
  })

  it('multi-dimensional identical unit vectors', () => {
    const v = new Float32Array([0.5, 0.5, 0.5, 0.5])
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 6)
  })

  it('single-element unit vector [1] · [1] = 1.0', () => {
    const a = new Float32Array([1])
    const b = new Float32Array([1])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 6)
  })
})

describe('cosineDistance', () => {
  it('identical unit vectors → returns 0.0', () => {
    const v = new Float32Array([1, 0])
    expect(cosineDistance(v, v)).toBeCloseTo(0.0, 6)
  })

  it('orthogonal unit vectors → returns 1.0', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([0, 1])
    expect(cosineDistance(a, b)).toBeCloseTo(1.0, 6)
  })

  it('opposite unit vectors → returns 2.0', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([-1, 0])
    expect(cosineDistance(a, b)).toBeCloseTo(2.0, 6)
  })

  it('[1/√2, 1/√2] and [1,0] → distance ≈ 0.2929', () => {
    const s = Math.SQRT1_2
    const a = new Float32Array([s, s])
    const b = new Float32Array([1, 0])
    expect(cosineDistance(a, b)).toBeCloseTo(1 - 0.7071, 4)
  })

  it('zero vector → does not throw', () => {
    const zero = new Float32Array([0, 0])
    const unit = new Float32Array([1, 0])
    expect(() => cosineDistance(zero, unit)).not.toThrow()
  })
})
