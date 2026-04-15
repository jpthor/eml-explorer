import { describe, expect, it } from 'vitest'
import { canonicalToString } from './canonical'
import { compileInputToEml, recognizeExpression } from './engine'

describe('EML rewrite engine', () => {
  it('round-trips the curated exact subset', () => {
    for (const source of [
      'e',
      'pi',
      'i',
      'x + y',
      'x - y',
      'x * y',
      'x / y',
      'exp(x)',
      'ln(x)',
      'sqrt(x)',
      'sin(x)',
      'cos(x)',
      'x^3 - 2 * x + 1',
    ]) {
      const compiled = compileInputToEml(source)
      const recognized = recognizeExpression(compiled.eml)
      expect(recognized.canonical, source).not.toBeNull()
      expect(canonicalToString(recognized.canonical!)).toBe(canonicalToString(compiled.canonical))
    }
  })
})
