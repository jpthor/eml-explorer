import { canonicalToString } from './canonical'
import { evaluateCanonical, lowerCanonicalToEml } from './engine'
import { parseCanonicalExpression } from './parser'
import type { CanonicalExpr, EmlExpr } from './types'

export type RegressionSample = {
  x: number
  y: number
}

export type RegressionCandidate = {
  formula: string
  canonical: CanonicalExpr
  eml: EmlExpr
  complexity: number
}

export type SimulatedRegressionDataset = {
  kind: 'simulated'
  sourceFormula: string
  complexity: number
  noiseSigma: number
  samples: RegressionSample[]
}

type RegressionOperator = '+' | '-' | '*' | '/' | '^' | 'exp' | 'ln' | 'sqrt' | 'sin' | 'cos'

export const MAX_REGRESSION_COMPLEXITY = 9

const BASE_CANDIDATE_FORMULAS = [
  'x',
  '-x',
  '1',
  '2',
  '3',
  'e',
  'pi',
  'x + 1',
  'x - 1',
  'x + 2',
  '2x',
  'x + x',
  'x * x',
  'x / 1',
  '1 / x',
  'x^2',
  'x^3',
  'x^2 + 1',
  'x^2 + x',
  'x^2 + x + 1',
  'x * (x + 1)',
  'x / (x + 1)',
  '(x + 1) / x',
  'x^3 - 2x + 1',
  'exp(x)',
  'ln(x)',
  'sqrt(x)',
  'ln(x + 4)',
  'sqrt(x + 4)',
  'sin(x)',
  'cos(x)',
  'exp(x) + x',
  'exp(x) + x^2',
  'exp(x) + sin(x)',
  'exp(x) + cos(x)',
  'sin(x) + x^2',
  'sin(x) + cos(x)',
  'cos(x) + x^2',
  'sqrt(x + 4) + x',
  'ln(x + 4) + x',
  'ln(x + 4) + cos(x)',
  'sin(x) * cos(x)',
  'sqrt(x + 4) * cos(x)',
  '(x^2 + 1) / (x + 4)',
  '(x^2 + x + 1) / (x + 4)',
  '(x^2 + 1) * cos(x)',
  'exp(x) + sin(x) + x',
  'exp(x) + sin(x) + x^2',
  'exp(x) + cos(x) + x^2',
  'sqrt(x + 4) + ln(x + 4)',
  'sqrt(x + 4) + ln(x + 4) + x',
  'sin(x) * cos(x) + x',
  'sin(x) * cos(x) + x^2',
  'sqrt(x + 4) * cos(x) + sin(x)',
  'sqrt(x + 4) * cos(x) + x',
  'ln(x + 4) + sin(x) * cos(x)',
  '(x^2 + x + 1) / (x + 4) + sin(x)',
  '(x^2 + 1) / (x + 4) + cos(x)',
  '(x^2 + 1) * cos(x) + sin(x)',
  'exp(x) + (x^2 + 1) / (x + 4)',
  'exp(x) + sqrt(x + 4) + cos(x)',
  'exp(x) + ln(x + 4) + sin(x)',
  'sin(x^2)',
  'cos(x^2)',
  '(sin(x) + cos(x)) * (x + 1)',
  '(sin(x) + 1) * (cos(x) + 1)',
  '(ln(x + 4) + x) * (sin(x) + 1)',
  '(sqrt(x + 4) + x) * (cos(x) + 1)',
  '((x^2 + 1) / (x + 4)) + (sin(x) + cos(x))',
  '(exp(x) + sin(x)) + (x^2 + cos(x))',
  '(exp(x) + cos(x)) + (sqrt(x + 4) + x)',
  '(sqrt(x + 4) + ln(x + 4)) + (sin(x) * cos(x))',
  '(exp(x) + sqrt(x + 4)) + ((x^2 + 1) / (x + 4))',
  '(ln(x + 4) + sin(x)) + (cos(x) + x^2)',
  '(sin(x^2) + cos(x)) + x',
  '(cos(x^2) + sin(x)) + x',
  '(exp(x) + sin(x)) * ((x + 4) / 4)',
  '(sqrt(x + 4) + ln(x + 4)) * ((x + 4) / 4)',
] as const

const COMPLEXITY_BENCHMARK_FORMULAS = [
  'x + 1',
  'x^2 + 1',
  'sin(x) + x^2',
  'exp(x) + sin(x) + x^2',
  '(exp(x) + ln(x + 4)) + sin(x) * x',
  '(sqrt(x + 4) + ln(x + 4)) + sin(x) * cos(x)',
  '(exp(x) + sqrt(x + 4)) + (ln(x + 4) + sin(x) * cos(x))',
  '(exp(x) + sqrt(x + 4)) + (ln(x + 4) + sin(x) * (x^2 / (x + 4)))',
  '(exp(x) + sqrt(x + 4)) + (ln(x + 4) + sin(x) * cos(x) * (x^2 / (x + 4)))',
  '(exp(x) + sqrt(x + 4)) - (ln(x + 4) + sin(x) * cos(x) * (x^2 / (x + 4)))',
] as const

const CANDIDATE_FORMULAS = [...BASE_CANDIDATE_FORMULAS, ...COMPLEXITY_BENCHMARK_FORMULAS] as const

function collectCanonicalOperators(expr: CanonicalExpr, operators: Set<RegressionOperator>) {
  switch (expr.kind) {
    case 'one':
    case 'x':
    case 'y':
    case 'int':
    case 'const':
      return
    case 'neg':
      operators.add('-')
      collectCanonicalOperators(expr.value, operators)
      return
    case 'fn':
      operators.add(expr.name)
      collectCanonicalOperators(expr.arg, operators)
      return
    case 'powInt':
      operators.add('^')
      collectCanonicalOperators(expr.base, operators)
      return
    case 'add':
      operators.add('+')
      collectCanonicalOperators(expr.left, operators)
      collectCanonicalOperators(expr.right, operators)
      return
    case 'sub':
      operators.add('-')
      collectCanonicalOperators(expr.left, operators)
      collectCanonicalOperators(expr.right, operators)
      return
    case 'mul':
      operators.add('*')
      collectCanonicalOperators(expr.left, operators)
      collectCanonicalOperators(expr.right, operators)
      return
    case 'div':
      operators.add('/')
      collectCanonicalOperators(expr.left, operators)
      collectCanonicalOperators(expr.right, operators)
      return
  }
}

export function canonicalComplexity(expr: CanonicalExpr): number {
  const operators = new Set<RegressionOperator>()
  collectCanonicalOperators(expr, operators)
  return operators.size
}

function buildPrecompiledCandidates(): RegressionCandidate[] {
  const unique = new Map<string, RegressionCandidate>()

  for (const formula of CANDIDATE_FORMULAS) {
    const canonical = parseCanonicalExpression(formula)
    const normalizedFormula = canonicalToString(canonical)

    if (unique.has(normalizedFormula)) {
      continue
    }

    unique.set(normalizedFormula, {
      formula: normalizedFormula,
      canonical,
      eml: lowerCanonicalToEml(canonical).expr,
      complexity: canonicalComplexity(canonical),
    })
  }

  return [...unique.values()].sort(
    (left, right) => left.complexity - right.complexity || left.formula.localeCompare(right.formula),
  )
}

const PRECOMPILED_CANDIDATES = buildPrecompiledCandidates()

export function buildRegressionDataset(formula: string, sampleCount = 181): RegressionSample[] {
  const canonical = parseCanonicalExpression(formula)
  const samples: RegressionSample[] = []

  for (let index = 0; index < sampleCount; index += 1) {
    const ratio = index / Math.max(1, sampleCount - 1)
    const x = -3 + ratio * 6
    const result = evaluateCanonical(canonical, x)
    if (result.kind === 'real') {
      const y = Number.parseFloat(result.display)
      if (Number.isFinite(y)) {
        samples.push({ x, y })
      }
    }
  }

  return samples
}

function gaussianNoise(random = Math.random): number {
  let u = 0
  let v = 0

  while (u === 0) {
    u = random()
  }

  while (v === 0) {
    v = random()
  }

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function buildNoisyRegressionDataset(
  formula: string,
  options: { sampleCount?: number; noiseFraction?: number; random?: () => number } = {},
): RegressionSample[] {
  const samples = buildRegressionDataset(formula, options.sampleCount)
  if (samples.length === 0) {
    return samples
  }

  const random = options.random ?? Math.random
  const values = samples.map((sample) => sample.y)
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const meanAbs = values.reduce((total, value) => total + Math.abs(value), 0) / values.length
  const noiseSigma =
    Math.max(0.04, maxY - minY, meanAbs) * (options.noiseFraction ?? 0.035)

  return samples.map((sample) => ({
    x: sample.x,
    y: sample.y + gaussianNoise(random) * noiseSigma,
  }))
}

export function createSimulatedRegressionDataset(
  complexity = 5,
  random = Math.random,
): SimulatedRegressionDataset {
  const targetComplexity = Math.max(1, Math.min(MAX_REGRESSION_COMPLEXITY, Math.round(complexity)))
  const sourcePool = PRECOMPILED_CANDIDATES.filter((candidate) => candidate.complexity === targetComplexity)
  const source = sourcePool[Math.floor(random() * sourcePool.length)] ?? sourcePool[0]

  if (!source) {
    throw new Error(`No regression source formula is available for complexity ${targetComplexity}.`)
  }

  const noiseFraction = 0.025 + random() * 0.025
  const samples = buildNoisyRegressionDataset(source.formula, { noiseFraction, random })
  const values = samples.map((sample) => sample.y)
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const meanAbs = values.reduce((total, value) => total + Math.abs(value), 0) / values.length
  const noiseSigma = Math.max(0.04, maxY - minY, meanAbs) * noiseFraction

  return {
    kind: 'simulated',
    sourceFormula: source.formula,
    complexity: targetComplexity,
    noiseSigma,
    samples,
  }
}

export function listRegressionCandidates(maxComplexity: number): RegressionCandidate[] {
  const cappedComplexity = Math.max(1, Math.min(MAX_REGRESSION_COMPLEXITY, Math.round(maxComplexity)))
  return PRECOMPILED_CANDIDATES.filter((candidate) => candidate.complexity <= cappedComplexity)
}

export function scoreCandidate(
  candidate: RegressionCandidate,
  samples: RegressionSample[],
): number {
  if (samples.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  let totalSquaredError = 0
  let validCount = 0

  for (const sample of samples) {
    const result = evaluateCanonical(candidate.canonical, sample.x)
    if (result.kind !== 'real') {
      totalSquaredError += 1e6
      continue
    }

    const prediction = Number.parseFloat(result.display)
    if (!Number.isFinite(prediction)) {
      totalSquaredError += 1e6
      continue
    }

    const delta = prediction - sample.y
    totalSquaredError += delta * delta
    validCount += 1
  }

  if (validCount === 0) {
    return Number.POSITIVE_INFINITY
  }

  return totalSquaredError / validCount
}

export function bestRegressionCandidate(formula: string, maxComplexity: number) {
  const samples = buildRegressionDataset(formula)
  const candidates = listRegressionCandidates(maxComplexity)

  let best: { candidate: RegressionCandidate; loss: number } | null = null
  for (const candidate of candidates) {
    const loss = scoreCandidate(candidate, samples)
    if (!best || loss < best.loss) {
      best = { candidate, loss }
    }
  }

  return {
    samples,
    best,
    candidates,
  }
}
