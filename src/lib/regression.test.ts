import { describe, expect, it } from 'vitest'
import {
  bestRegressionCandidate,
  canonicalComplexity,
  createSimulatedRegressionDataset,
  listRegressionCandidates,
} from './regression'
import { parseCanonicalExpression } from './parser'

describe('regression helpers', () => {
  it('filters the candidate library by requested operator complexity', () => {
    const complexityTwo = listRegressionCandidates(2)
    const complexityFive = listRegressionCandidates(5)

    expect(complexityTwo.length).toBeLessThan(complexityFive.length)
    expect(complexityFive.every((candidate) => candidate.complexity <= 5)).toBe(true)
    expect(complexityFive.some((candidate) => candidate.formula === 'sin(x)')).toBe(true)
  })

  it('recovers exp(x) from generated samples', () => {
    const result = bestRegressionCandidate('exp(x)', 4)

    expect(result.best?.candidate.formula).toBe('exp(x)')
    expect(result.best?.loss ?? 1).toBeLessThan(1e-10)
  })

  it('creates a noisy simulated dataset from a semi-complex source', () => {
    const randomValues = [0.2, 0.6, 0.4, 0.8, 0.3, 0.7]
    let index = 0
    const dataset = createSimulatedRegressionDataset(5, () => {
      const value = randomValues[index % randomValues.length]
      index += 1
      return value
    })

    expect(dataset.kind).toBe('simulated')
    expect(dataset.samples.length).toBeGreaterThan(100)
    expect(dataset.sourceFormula.length).toBeGreaterThan(0)
    expect(dataset.noiseSigma).toBeGreaterThan(0)
    expect(dataset.complexity).toBe(5)
    expect(canonicalComplexity(parseCanonicalExpression(dataset.sourceFormula))).toBe(5)
  })

  it('supports the full 9-step complexity range', () => {
    const dataset = createSimulatedRegressionDataset(9, () => 0.4)
    const candidates = listRegressionCandidates(9)

    expect(dataset.complexity).toBe(9)
    expect(canonicalComplexity(parseCanonicalExpression(dataset.sourceFormula))).toBe(9)
    expect(candidates.some((candidate) => candidate.complexity === 9)).toBe(true)
  })

  it('clamps over-large complexity requests down to 9', () => {
    const dataset = createSimulatedRegressionDataset(10, () => 0.4)
    const candidates = listRegressionCandidates(10)

    expect(dataset.complexity).toBe(9)
    expect(candidates.every((candidate) => candidate.complexity <= 9)).toBe(true)
  })
})
