import {
  add,
  complex,
  cos,
  divide,
  exp,
  format,
  log,
  multiply,
  pow,
  sin,
  sqrt,
  subtract,
  type Complex,
} from 'mathjs'
import { canonicalIntValue, canonicalToString, normalizeCanonical } from './canonical'
import { eml, emlEquals, leaf } from './emlAst'
import { parseCanonicalExpression } from './parser'
import type {
  CanonicalExpr,
  EvalResult,
  EmlExpr,
  LowerTraceStep,
  RecognitionResult,
  RewriteRule,
} from './types'

type NumericValue = number | Complex

type Pattern =
  | { kind: 'capture'; name: string }
  | { kind: 'leaf'; value: '1' | 'x' | 'y' }
  | { kind: 'eml'; left: Pattern; right: Pattern }

const recognitionCache = new Map<string, RecognitionResult>()
const integerCache = new Map<number, EmlExpr>()

const capture = (name: string): Pattern => ({ kind: 'capture', name })
const pLeaf = (value: '1' | 'x' | 'y'): Pattern => ({ kind: 'leaf', value })
const pEml = (left: Pattern, right: Pattern): Pattern => ({ kind: 'eml', left, right })

const oneLeaf = () => leaf('1')
const xLeaf = () => leaf('x')
const yLeaf = () => leaf('y')

const expEml = (value: EmlExpr) => eml(value, oneLeaf())
const logEml = (value: EmlExpr) => eml(oneLeaf(), expEml(eml(oneLeaf(), value)))
const zeroEml = () => logEml(oneLeaf())
const subtractEml = (leftExpr: EmlExpr, rightExpr: EmlExpr) =>
  eml(logEml(leftExpr), expEml(rightExpr))
const negEml = (value: EmlExpr) => subtractEml(zeroEml(), value)
const plusEml = (leftExpr: EmlExpr, rightExpr: EmlExpr) => subtractEml(leftExpr, negEml(rightExpr))
const invEml = (value: EmlExpr) => expEml(negEml(logEml(value)))
const timesEml = (leftExpr: EmlExpr, rightExpr: EmlExpr) =>
  expEml(plusEml(logEml(leftExpr), logEml(rightExpr)))
const divideEml = (leftExpr: EmlExpr, rightExpr: EmlExpr) =>
  timesEml(leftExpr, invEml(rightExpr))
const halfEml = (value: EmlExpr) => divideEml(value, integerToEml(2))
const iConstEml = () => expEml(halfEml(logEml(integerToEml(-1))))
const piConstEml = () => divideEml(logEml(integerToEml(-1)), iConstEml())
const sqrtEml = (value: EmlExpr) => expEml(halfEml(logEml(value)))
const powerEml = (base: EmlExpr, exponent: EmlExpr) => expEml(timesEml(exponent, logEml(base)))
const avgEml = (leftExpr: EmlExpr, rightExpr: EmlExpr) => halfEml(plusEml(leftExpr, rightExpr))
const coshEml = (value: EmlExpr) => avgEml(expEml(value), expEml(negEml(value)))
const cosEml = (value: EmlExpr) => coshEml(divideEml(value, iConstEml()))
const sinEml = (value: EmlExpr) => cosEml(subtractEml(value, halfEml(piConstEml())))

const pExp = (value: Pattern) => pEml(value, pLeaf('1'))
const pLog = (value: Pattern) => pEml(pLeaf('1'), pExp(pEml(pLeaf('1'), value)))
const pZero = () => pLog(pLeaf('1'))
const pSubtract = (leftExpr: Pattern, rightExpr: Pattern) => pEml(pLog(leftExpr), pExp(rightExpr))
const pNeg = (value: Pattern) => pSubtract(pZero(), value)
const pPlus = (leftExpr: Pattern, rightExpr: Pattern) => pSubtract(leftExpr, pNeg(rightExpr))
const pInv = (value: Pattern) => pExp(pNeg(pLog(value)))
const pTimes = (leftExpr: Pattern, rightExpr: Pattern) => pExp(pPlus(pLog(leftExpr), pLog(rightExpr)))
const pDivide = (leftExpr: Pattern, rightExpr: Pattern) => pTimes(leftExpr, pInv(rightExpr))
const pHalf = (value: Pattern) => pDivide(value, lowerPatternInteger(2))
const pSqrt = (value: Pattern) => pExp(pHalf(pLog(value)))
const pPower = (base: Pattern, exponent: Pattern) => pExp(pTimes(exponent, pLog(base)))
const pIConst = () => pExp(pHalf(pLog(lowerPatternInteger(-1))))
const pPiConst = () => pDivide(pLog(lowerPatternInteger(-1)), pIConst())
const pCosh = (value: Pattern) => pHalf(pPlus(pExp(value), pExp(pNeg(value))))
const pCos = (value: Pattern) => pCosh(pDivide(value, pIConst()))
const pSin = (value: Pattern) => pCos(pSubtract(value, pHalf(pPiConst())))

function lowerPatternInteger(value: number): Pattern {
  if (value === 1) {
    return pLeaf('1')
  }

  if (value === 0) {
    return pZero()
  }

  if (value < 0) {
    return pNeg(lowerPatternInteger(Math.abs(value)))
  }

  return pPlus(lowerPatternInteger(value - 1), pLeaf('1'))
}

function matchPattern(
  pattern: Pattern,
  expr: EmlExpr,
  captures: Map<string, EmlExpr> = new Map(),
): Map<string, EmlExpr> | null {
  if (pattern.kind === 'capture') {
    const existing = captures.get(pattern.name)
    if (existing && !emlEquals(existing, expr)) {
      return null
    }

    captures.set(pattern.name, expr)
    return captures
  }

  if (pattern.kind === 'leaf') {
    return expr.kind === 'leaf' && expr.value === pattern.value ? captures : null
  }

  if (expr.kind !== 'eml') {
    return null
  }

  const leftCaptures = matchPattern(pattern.left, expr.left, captures)
  if (!leftCaptures) {
    return null
  }

  return matchPattern(pattern.right, expr.right, leftCaptures)
}

function exprKey(expr: EmlExpr): string {
  return expr.kind === 'leaf'
    ? expr.value
    : `E(${exprKey(expr.left)},${exprKey(expr.right)})`
}

export function integerToEml(value: number): EmlExpr {
  const cached = integerCache.get(value)
  if (cached) {
    return cached
  }

  let result: EmlExpr
  if (value === 1) {
    result = oneLeaf()
  } else if (value === 0) {
    result = zeroEml()
  } else if (value < 0) {
    result = negEml(integerToEml(Math.abs(value)))
  } else {
    result = plusEml(integerToEml(value - 1), oneLeaf())
  }

  integerCache.set(value, result)
  return result
}

function lowerExpr(expr: CanonicalExpr, steps: LowerTraceStep[]): EmlExpr {
  switch (expr.kind) {
    case 'one':
      steps.push({ label: 'terminal 1', canonical: '1' })
      return oneLeaf()
    case 'x':
      steps.push({ label: 'terminal x', canonical: 'x' })
      return xLeaf()
    case 'y':
      steps.push({ label: 'terminal y', canonical: 'y' })
      return yLeaf()
    case 'int':
      steps.push({ label: 'integer witness', canonical: canonicalToString(expr) })
      return integerToEml(expr.value)
    case 'const':
      steps.push({ label: `constant ${expr.value}`, canonical: canonicalToString(expr) })
      if (expr.value === 'e') {
        return expEml(oneLeaf())
      }

      if (expr.value === 'i') {
        return iConstEml()
      }

      return piConstEml()
    case 'neg': {
      const value = lowerExpr(expr.value, steps)
      steps.push({ label: 'negation witness', canonical: canonicalToString(expr) })
      return negEml(value)
    }
    case 'fn': {
      const arg = lowerExpr(expr.arg, steps)
      const labels = {
        exp: 'exp witness',
        ln: 'log witness',
        sqrt: 'sqrt witness',
        sin: 'sin witness',
        cos: 'cos witness',
      } as const
      steps.push({ label: labels[expr.name], canonical: canonicalToString(expr) })
      switch (expr.name) {
        case 'exp':
          return expEml(arg)
        case 'ln':
          return logEml(arg)
        case 'sqrt':
          return sqrtEml(arg)
        case 'sin':
          return sinEml(arg)
        case 'cos':
          return cosEml(arg)
        default: {
          const unreachable: never = expr.name
          throw new Error(`Unsupported canonical function ${unreachable}`)
        }
      }
    }
    case 'powInt': {
      const base = lowerExpr(expr.base, steps)
      steps.push({ label: 'integer power witness', canonical: canonicalToString(expr) })
      return powerEml(base, integerToEml(expr.exponent))
    }
    case 'add': {
      const leftExpr = lowerExpr(expr.left, steps)
      const rightExpr = lowerExpr(expr.right, steps)
      steps.push({ label: 'addition witness', canonical: canonicalToString(expr) })
      return plusEml(leftExpr, rightExpr)
    }
    case 'sub': {
      const leftExpr = lowerExpr(expr.left, steps)
      const rightExpr = lowerExpr(expr.right, steps)
      steps.push({ label: 'subtraction witness', canonical: canonicalToString(expr) })
      return subtractEml(leftExpr, rightExpr)
    }
    case 'mul': {
      const leftExpr = lowerExpr(expr.left, steps)
      const rightExpr = lowerExpr(expr.right, steps)
      steps.push({ label: 'multiplication witness', canonical: canonicalToString(expr) })
      return timesEml(leftExpr, rightExpr)
    }
    case 'div': {
      const leftExpr = lowerExpr(expr.left, steps)
      const rightExpr = lowerExpr(expr.right, steps)
      steps.push({ label: 'division witness', canonical: canonicalToString(expr) })
      return divideEml(leftExpr, rightExpr)
    }
  }
}

export function lowerCanonicalToEml(expr: CanonicalExpr): { expr: EmlExpr; steps: LowerTraceStep[] } {
  const steps: LowerTraceStep[] = []
  return {
    expr: lowerExpr(normalizeCanonical(expr), steps),
    steps,
  }
}

export function compileInputToEml(input: string) {
  const canonical = parseCanonicalExpression(input)
  const lowered = lowerCanonicalToEml(canonical)
  return {
    canonical,
    eml: lowered.expr,
    steps: lowered.steps,
  }
}

type RuleKind =
  | 'const-zero'
  | 'const-e'
  | 'const-pi'
  | 'const-i'
  | 'exp'
  | 'ln'
  | 'sqrt'
  | 'sin'
  | 'cos'
  | 'neg'
  | 'powInt'
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'

function captureList(match: Map<string, EmlExpr>, names: string[]): EmlExpr[] | null {
  const values = names.map((name) => match.get(name) ?? null)
  return values.every(Boolean) ? (values as EmlExpr[]) : null
}

export const rewriteRules: RewriteRule[] = [
  {
    id: 'const-zero',
    label: 'constant 0',
    forward: () => zeroEml(),
    reverse: (expr) => (emlEquals(expr, zeroEml()) ? [] : null),
  },
  {
    id: 'const-e',
    label: 'constant e',
    forward: () => expEml(oneLeaf()),
    reverse: (expr) => (emlEquals(expr, expEml(oneLeaf())) ? [] : null),
  },
  {
    id: 'const-pi',
    label: 'constant pi',
    forward: () => piConstEml(),
    reverse: (expr) => (emlEquals(expr, piConstEml()) ? [] : null),
  },
  {
    id: 'const-i',
    label: 'constant i',
    forward: () => iConstEml(),
    reverse: (expr) => (emlEquals(expr, iConstEml()) ? [] : null),
  },
  {
    id: 'exp',
    label: 'exp witness',
    forward: (arg) => expEml(arg),
    reverse: (expr) => {
      const match = matchPattern(pExp(capture('arg')), expr)
      return match ? captureList(match, ['arg']) : null
    },
  },
  {
    id: 'ln',
    label: 'log witness',
    forward: (arg) => logEml(arg),
    reverse: (expr) => {
      const match = matchPattern(pLog(capture('arg')), expr)
      return match ? captureList(match, ['arg']) : null
    },
  },
  {
    id: 'sqrt',
    label: 'sqrt witness',
    forward: (arg) => sqrtEml(arg),
    reverse: (expr) => {
      const match = matchPattern(pSqrt(capture('arg')), expr)
      return match ? captureList(match, ['arg']) : null
    },
  },
  {
    id: 'sin',
    label: 'sin witness',
    forward: (arg) => sinEml(arg),
    reverse: (expr) => {
      const match = matchPattern(pSin(capture('arg')), expr)
      return match ? captureList(match, ['arg']) : null
    },
  },
  {
    id: 'cos',
    label: 'cos witness',
    forward: (arg) => cosEml(arg),
    reverse: (expr) => {
      const match = matchPattern(pCos(capture('arg')), expr)
      return match ? captureList(match, ['arg']) : null
    },
  },
  {
    id: 'neg',
    label: 'negation witness',
    forward: (arg) => negEml(arg),
    reverse: (expr) => {
      const match = matchPattern(pNeg(capture('arg')), expr)
      return match ? captureList(match, ['arg']) : null
    },
  },
  {
    id: 'powInt',
    label: 'integer power witness',
    forward: (base, exponent) => powerEml(base, exponent),
    reverse: (expr) => {
      const match = matchPattern(pPower(capture('base'), capture('exponent')), expr)
      return match ? captureList(match, ['base', 'exponent']) : null
    },
  },
  {
    id: 'add',
    label: 'addition witness',
    forward: (leftExpr, rightExpr) => plusEml(leftExpr, rightExpr),
    reverse: (expr) => {
      const match = matchPattern(pPlus(capture('left'), capture('right')), expr)
      return match ? captureList(match, ['left', 'right']) : null
    },
  },
  {
    id: 'sub',
    label: 'subtraction witness',
    forward: (leftExpr, rightExpr) => subtractEml(leftExpr, rightExpr),
    reverse: (expr) => {
      const match = matchPattern(pSubtract(capture('left'), capture('right')), expr)
      return match ? captureList(match, ['left', 'right']) : null
    },
  },
  {
    id: 'mul',
    label: 'multiplication witness',
    forward: (leftExpr, rightExpr) => timesEml(leftExpr, rightExpr),
    reverse: (expr) => {
      const match = matchPattern(pTimes(capture('left'), capture('right')), expr)
      return match ? captureList(match, ['left', 'right']) : null
    },
  },
  {
    id: 'div',
    label: 'division witness',
    forward: (leftExpr, rightExpr) => divideEml(leftExpr, rightExpr),
    reverse: (expr) => {
      const match = matchPattern(pDivide(capture('left'), capture('right')), expr)
      return match ? captureList(match, ['left', 'right']) : null
    },
  },
]

function applyRule(
  kind: RuleKind,
  operands: EmlExpr[],
): RecognitionResult | null {
  switch (kind) {
    case 'const-zero':
      return { canonical: { kind: 'int', value: 0 }, ruleId: kind, label: 'constant 0' }
    case 'const-e':
      return { canonical: { kind: 'const', value: 'e' }, ruleId: kind, label: 'constant e' }
    case 'const-pi':
      return { canonical: { kind: 'const', value: 'pi' }, ruleId: kind, label: 'constant pi' }
    case 'const-i':
      return { canonical: { kind: 'const', value: 'i' }, ruleId: kind, label: 'constant i' }
    case 'exp': {
      const arg = recognizeExpression(operands[0]).canonical
      return arg ? { canonical: { kind: 'fn', name: 'exp', arg }, ruleId: kind, label: 'exp witness' } : null
    }
    case 'ln': {
      const arg = recognizeExpression(operands[0]).canonical
      return arg ? { canonical: { kind: 'fn', name: 'ln', arg }, ruleId: kind, label: 'log witness' } : null
    }
    case 'sqrt': {
      const arg = recognizeExpression(operands[0]).canonical
      return arg ? { canonical: { kind: 'fn', name: 'sqrt', arg }, ruleId: kind, label: 'sqrt witness' } : null
    }
    case 'sin': {
      const arg = recognizeExpression(operands[0]).canonical
      return arg ? { canonical: { kind: 'fn', name: 'sin', arg }, ruleId: kind, label: 'sin witness' } : null
    }
    case 'cos': {
      const arg = recognizeExpression(operands[0]).canonical
      return arg ? { canonical: { kind: 'fn', name: 'cos', arg }, ruleId: kind, label: 'cos witness' } : null
    }
    case 'neg': {
      const value = recognizeExpression(operands[0]).canonical
      return value ? { canonical: normalizeCanonical({ kind: 'neg', value }), ruleId: kind, label: 'negation witness' } : null
    }
    case 'powInt': {
      const base = recognizeExpression(operands[0]).canonical
      const exponentExpr = recognizeExpression(operands[1]).canonical
      const exponent = exponentExpr ? canonicalIntValue(exponentExpr) : null
      if (!base || exponent === null) {
        return null
      }

      return {
        canonical: normalizeCanonical({ kind: 'powInt', base, exponent }),
        ruleId: kind,
        label: 'integer power witness',
      }
    }
    case 'add': {
      const leftExpr = recognizeExpression(operands[0]).canonical
      const rightExpr = recognizeExpression(operands[1]).canonical
      if (!leftExpr || !rightExpr) {
        return null
      }

      return {
        canonical: normalizeCanonical({ kind: 'add', left: leftExpr, right: rightExpr }),
        ruleId: kind,
        label: 'addition witness',
      }
    }
    case 'sub': {
      const leftExpr = recognizeExpression(operands[0]).canonical
      const rightExpr = recognizeExpression(operands[1]).canonical
      if (!leftExpr || !rightExpr) {
        return null
      }

      return {
        canonical: normalizeCanonical({ kind: 'sub', left: leftExpr, right: rightExpr }),
        ruleId: kind,
        label: 'subtraction witness',
      }
    }
    case 'mul': {
      const leftExpr = recognizeExpression(operands[0]).canonical
      const rightExpr = recognizeExpression(operands[1]).canonical
      if (!leftExpr || !rightExpr) {
        return null
      }

      return {
        canonical: normalizeCanonical({ kind: 'mul', left: leftExpr, right: rightExpr }),
        ruleId: kind,
        label: 'multiplication witness',
      }
    }
    case 'div': {
      const leftExpr = recognizeExpression(operands[0]).canonical
      const rightExpr = recognizeExpression(operands[1]).canonical
      if (!leftExpr || !rightExpr) {
        return null
      }

      return {
        canonical: normalizeCanonical({ kind: 'div', left: leftExpr, right: rightExpr }),
        ruleId: kind,
        label: 'division witness',
      }
    }
  }
}

const PRIORITY: RuleKind[] = [
  'const-zero',
  'const-e',
  'const-pi',
  'const-i',
  'sin',
  'cos',
  'sqrt',
  'powInt',
  'div',
  'mul',
  'add',
  'sub',
  'neg',
  'ln',
  'exp',
]

export function recognizeExpression(expr: EmlExpr): RecognitionResult {
  const key = exprKey(expr)
  const cached = recognitionCache.get(key)
  if (cached) {
    return cached
  }

  let result: RecognitionResult
  if (expr.kind === 'leaf') {
    if (expr.value === '1') {
      result = { canonical: { kind: 'one' }, ruleId: 'terminal-1', label: 'terminal 1' }
    } else if (expr.value === 'x') {
      result = { canonical: { kind: 'x' }, ruleId: 'terminal-x', label: 'terminal x' }
    } else {
      result = { canonical: { kind: 'y' }, ruleId: 'terminal-y', label: 'terminal y' }
    }
  } else {
    result = { canonical: null, ruleId: null, label: null }
    for (const kind of PRIORITY) {
      const rule = rewriteRules.find((entry) => entry.id === kind)
      if (!rule) {
        continue
      }

      const operands = rule.reverse(expr)
      if (!operands) {
        continue
      }

      const applied = applyRule(kind, operands)
      if (applied?.canonical) {
        result = applied
        break
      }
    }
  }

  recognitionCache.set(key, result)
  return result
}

function lowerEdgeLog(value: NumericValue): NumericValue {
  if (typeof value === 'number') {
    if (value < 0) {
      return complex(Math.log(Math.abs(value)), -Math.PI)
    }

    return Math.log(value)
  }

  const current = toComplex(value)
  if (Math.abs(current.im) < 1e-12 && current.re < 0) {
    return complex(Math.log(Math.abs(current.re)), -Math.PI)
  }

  if (Math.abs(current.im) < 1e-12 && current.re === 0) {
    return -Infinity
  }

  return log(current) as NumericValue
}

function toComplex(value: NumericValue): Complex {
  return typeof value === 'number' ? complex(value, 0) : value
}

function classifyValue(value: NumericValue): EvalResult {
  const current = toComplex(value)
  if (!Number.isFinite(current.re) || !Number.isFinite(current.im)) {
    return {
      kind: 'error',
      value,
      display: 'non-finite result',
      message: 'The expression reached an infinity or undefined branch.',
    }
  }

  if (Math.abs(current.im) < 1e-9) {
    return {
      kind: 'real',
      value,
      display: format(current.re, { precision: 12 }),
    }
  }

  return {
    kind: 'complex',
    value,
    display: format(current, { precision: 12 }),
    message: 'Complex intermediate values were required.',
  }
}

function safeExp(value: NumericValue): NumericValue {
  if (typeof value === 'number') {
    return Math.exp(value)
  }

  if (!Number.isFinite(value.re) && value.re === -Infinity) {
    return 0
  }

  return exp(value) as NumericValue
}

function safeSubtract(leftValue: NumericValue, rightValue: NumericValue): NumericValue {
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return leftValue - rightValue
  }

  return subtract(leftValue as never, rightValue as never) as NumericValue
}

function evaluateCanonicalValue(expr: CanonicalExpr, xValue: number, yValue: number): NumericValue {
  switch (expr.kind) {
    case 'one':
      return 1
    case 'x':
      return xValue
    case 'y':
      return yValue
    case 'int':
      return expr.value
    case 'const':
      if (expr.value === 'e') {
        return Math.E
      }

      if (expr.value === 'pi') {
        return Math.PI
      }

      return complex(0, 1)
    case 'neg':
      return multiply(-1, evaluateCanonicalValue(expr.value, xValue, yValue)) as NumericValue
    case 'add':
      return add(
        evaluateCanonicalValue(expr.left, xValue, yValue),
        evaluateCanonicalValue(expr.right, xValue, yValue),
      ) as NumericValue
    case 'sub':
      return subtract(
        evaluateCanonicalValue(expr.left, xValue, yValue),
        evaluateCanonicalValue(expr.right, xValue, yValue),
      ) as NumericValue
    case 'mul':
      return multiply(
        evaluateCanonicalValue(expr.left, xValue, yValue),
        evaluateCanonicalValue(expr.right, xValue, yValue),
      ) as NumericValue
    case 'div':
      return divide(
        evaluateCanonicalValue(expr.left, xValue, yValue),
        evaluateCanonicalValue(expr.right, xValue, yValue),
      ) as NumericValue
    case 'powInt':
      return pow(evaluateCanonicalValue(expr.base, xValue, yValue), expr.exponent) as NumericValue
    case 'fn': {
      const arg = evaluateCanonicalValue(expr.arg, xValue, yValue)
      switch (expr.name) {
        case 'exp':
          return exp(toComplex(arg)) as NumericValue
        case 'ln':
          return log(toComplex(arg)) as NumericValue
        case 'sqrt':
          return sqrt(toComplex(arg)) as NumericValue
        case 'sin':
          return sin(toComplex(arg)) as NumericValue
        case 'cos':
          return cos(toComplex(arg)) as NumericValue
      }
    }
  }
}

function evaluateEmlValue(expr: EmlExpr, xValue: number, yValue: number): NumericValue {
  if (expr.kind === 'leaf') {
    if (expr.value === '1') {
      return 1
    }

    return expr.value === 'x' ? xValue : yValue
  }

  const leftValue = evaluateEmlValue(expr.left, xValue, yValue)
  const rightValue = evaluateEmlValue(expr.right, xValue, yValue)
  return safeSubtract(safeExp(leftValue), lowerEdgeLog(rightValue))
}

export function evaluateCanonical(expr: CanonicalExpr, xValue: number, yValue = 0): EvalResult {
  try {
    return classifyValue(evaluateCanonicalValue(expr, xValue, yValue))
  } catch (error) {
    return {
      kind: 'error',
      value: null,
      display: 'evaluation failed',
      message: error instanceof Error ? error.message : 'Unknown canonical evaluation error.',
    }
  }
}

export function evaluateEml(expr: EmlExpr, xValue: number, yValue = 0): EvalResult {
  try {
    return classifyValue(evaluateEmlValue(expr, xValue, yValue))
  } catch (error) {
    return {
      kind: 'error',
      value: null,
      display: 'evaluation failed',
      message: error instanceof Error ? error.message : 'Unknown EML evaluation error.',
    }
  }
}

export function compareEvaluations(expr: EmlExpr, xValue: number, yValue = 0) {
  const recognized = recognizeExpression(expr).canonical
  const emlResult = evaluateEml(expr, xValue, yValue)
  const canonicalResult = recognized ? evaluateCanonical(recognized, xValue, yValue) : null
  return {
    recognized,
    emlResult,
    canonicalResult,
  }
}

export function resultMismatch(leftResult: EvalResult, rightResult: EvalResult): boolean {
  if (leftResult.kind === 'error' || rightResult.kind === 'error') {
    return leftResult.kind !== rightResult.kind || leftResult.display !== rightResult.display
  }

  const leftValue = toComplex(leftResult.value as NumericValue)
  const rightValue = toComplex(rightResult.value as NumericValue)
  return Math.abs(leftValue.re - rightValue.re) > 1e-9 || Math.abs(leftValue.im - rightValue.im) > 1e-9
}

export function summarizeRecognition(expr: EmlExpr): string | null {
  const result = recognizeExpression(expr)
  return result.canonical ? canonicalToString(result.canonical) : null
}
