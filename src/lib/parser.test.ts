import { describe, expect, it } from 'vitest'
import { canonicalToString } from './canonical'
import { parseCanonicalExpression, ParserError } from './parser'

describe('parseCanonicalExpression', () => {
  it('accepts supported scientific expressions', () => {
    expect(canonicalToString(parseCanonicalExpression('sin(x) + sqrt(x)'))).toBe('sin(x) + sqrt(x)')
    expect(canonicalToString(parseCanonicalExpression('x^3'))).toBe('x^3')
    expect(canonicalToString(parseCanonicalExpression('x + y'))).toBe('x + y')
    expect(canonicalToString(parseCanonicalExpression('x - y'))).toBe('x - y')
    expect(canonicalToString(parseCanonicalExpression('2x'))).toBe('x * 2')
    expect(canonicalToString(parseCanonicalExpression('2(x + y)'))).toBe('(x + y) * 2')
    expect(canonicalToString(parseCanonicalExpression('-x'))).toBe('-x')
    expect(canonicalToString(parseCanonicalExpression('pi'))).toBe('pi')
  })

  it('rejects unsupported symbolic input', () => {
    expect(() => parseCanonicalExpression('3.5')).toThrowError(ParserError)
    expect(() => parseCanonicalExpression('x^1.5')).toThrowError(ParserError)
    expect(() => parseCanonicalExpression('tan(x)')).toThrowError(ParserError)
    expect(() => parseCanonicalExpression('z + 1')).toThrowError(ParserError)
  })
})
