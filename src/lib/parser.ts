import { parse } from 'mathjs'
import { integerExpr, normalizeCanonical } from './canonical'
import type { CanonicalExpr } from './types'

export class ParserError extends Error {}

const DECIMAL_PATTERN = /\d+(?:\.\d+|e[+-]?\d+)/i

export function parseCanonicalExpression(input: string): CanonicalExpr {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new ParserError('Enter a formula to import.')
  }

  if (DECIMAL_PATTERN.test(trimmed)) {
    throw new ParserError('Decimal literals are not allowed in symbolic import mode. Use integers and the value fields separately.')
  }

  const root = parse(trimmed)
  return normalizeCanonical(fromMathNode(root))
}

function fromMathNode(node: unknown): CanonicalExpr {
  const current = node as {
    type: string
    content?: unknown
    value?: number
    name?: string
    fn?: string | { name?: string }
    args?: unknown[]
    implicit?: boolean
    op?: string
  }

  switch (current.type) {
    case 'ParenthesisNode':
      return fromMathNode(current.content)
    case 'ConstantNode': {
      if (!Number.isInteger(current.value)) {
        throw new ParserError('Only integer literals are allowed in symbolic import mode.')
      }

      return integerExpr(Number(current.value))
    }
    case 'SymbolNode': {
      if (current.name === 'x') {
        return { kind: 'x' }
      }

       if (current.name === 'y') {
        return { kind: 'y' }
      }

      if (current.name === 'pi' || current.name === 'e' || current.name === 'i') {
        return { kind: 'const', value: current.name }
      }

      throw new ParserError(`Unsupported symbol "${current.name}". Use x, y, e, pi, or i.`)
    }
    case 'FunctionNode': {
      const name =
        typeof current.fn === 'string'
          ? current.fn
          : current.fn?.name ?? ''
      if (!['exp', 'ln', 'sqrt', 'sin', 'cos'].includes(name)) {
        throw new ParserError(`Unsupported function "${name}".`)
      }

      if ((current.args?.length ?? 0) !== 1) {
        throw new ParserError(`Function "${name}" must have exactly one argument.`)
      }

      return {
        kind: 'fn',
        name: name as 'exp' | 'ln' | 'sqrt' | 'sin' | 'cos',
        arg: fromMathNode(current.args?.[0]),
      }
    }
    case 'OperatorNode': {
      const fnName =
        typeof current.fn === 'string'
          ? current.fn
          : current.fn?.name

      if (fnName === 'unaryMinus') {
        return {
          kind: 'neg',
          value: fromMathNode(current.args?.[0]),
        }
      }

      if ((current.args?.length ?? 0) !== 2) {
        throw new ParserError(`Unsupported operator "${current.op}".`)
      }

      const left = fromMathNode(current.args?.[0])
      const right = fromMathNode(current.args?.[1])

      switch (current.op) {
        case '+':
          return { kind: 'add', left, right }
        case '-':
          return { kind: 'sub', left, right }
        case '*':
          // mathjs marks adjacency like 2x or 2(x + 1) as implicit multiplication.
          return { kind: 'mul', left, right }
        case '/':
          return { kind: 'div', left, right }
        case '^': {
          const exponent = extractInteger(right)
          if (exponent === null) {
            throw new ParserError('Exponent must be an integer literal.')
          }

          return {
            kind: 'powInt',
            base: left,
            exponent,
          }
        }
        default:
          throw new ParserError(`Unsupported operator "${current.op}".`)
      }
    }
    default:
      throw new ParserError(`Unsupported syntax node "${current.type}".`)
  }
}

function extractInteger(expr: CanonicalExpr): number | null {
  switch (expr.kind) {
    case 'one':
      return 1
    case 'int':
      return expr.value
    case 'neg': {
      const value = extractInteger(expr.value)
      return value === null ? null : -value
    }
    default:
      return null
  }
}
