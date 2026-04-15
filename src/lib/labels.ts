import { canonicalToString } from './canonical'
import type { Path } from './types'
import { listSubtrees } from './emlAst'
import { recognizeExpression } from './engine'

export function canonicalNodeLabel(expr: ReturnType<typeof recognizeExpression>['canonical']): string | null {
  if (!expr) {
    return null
  }

  switch (expr.kind) {
    case 'one':
      return '1'
    case 'x':
      return 'x'
    case 'y':
      return 'y'
    case 'int':
      return String(expr.value)
    case 'const':
      return expr.value === 'pi' ? 'pi' : expr.value
    case 'neg':
      return '-'
    case 'add':
      return '+'
    case 'sub':
      return '-'
    case 'mul':
      return '×'
    case 'div':
      return '÷'
    case 'powInt':
      return `^${expr.exponent}`
    case 'fn':
      return expr.name
  }
}

export function buildLabels(expr: Parameters<typeof listSubtrees>[0]): Record<Path, string> {
  return buildLabelSets(expr).labels
}

export function buildLabelSets(expr: Parameters<typeof listSubtrees>[0]): {
  labels: Record<Path, string>
  collapseLabels: Record<Path, string>
} {
  const labels: Record<Path, string> = {}
  const collapseLabels: Record<Path, string> = {}

  for (const entry of listSubtrees(expr)) {
    const recognition = recognizeExpression(entry.expr)
    const fallback = entry.expr.kind === 'leaf' ? entry.expr.value : 'E'
    labels[entry.path] = canonicalNodeLabel(recognition.canonical) ?? fallback
    collapseLabels[entry.path] = recognition.canonical
      ? canonicalToString(recognition.canonical)
      : fallback
  }

  return { labels, collapseLabels }
}
