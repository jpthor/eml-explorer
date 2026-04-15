import { describe, expect, it } from 'vitest'
import { compareEvaluations, compileInputToEml, resultMismatch } from './engine'

describe('EML evaluation', () => {
  it('matches the recognized canonical evaluation on representative inputs', () => {
    const cases = [
      ['sin(x)', 1.25, 0],
      ['cos(x)', -0.75, 0],
      ['sqrt(x)', 9, 0],
      ['exp(x)', 0.5, 0],
      ['ln(x)', 2.5, 0],
      ['x + y', 3, -2],
      ['x - y', 3, -2],
      ['x * y', 3, -2],
      ['x / y', 3, -2],
      ['x^3 - 2 * x + 1', 3, 0],
      ['pi', 0, 0],
    ] as const

    for (const [source, xValue, yValue] of cases) {
      const compiled = compileInputToEml(source)
      const comparison = compareEvaluations(compiled.eml, xValue, yValue)
      expect(comparison.canonicalResult, source).not.toBeNull()
      expect(resultMismatch(comparison.emlResult, comparison.canonicalResult!)).toBe(false)
    }
  })
})
