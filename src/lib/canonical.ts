import katex from 'katex'
import type { CanonicalExpr } from './types'

const PRECEDENCE: Record<CanonicalExpr['kind'], number> = {
  one: 5,
  x: 5,
  y: 5,
  int: 5,
  const: 5,
  fn: 5,
  powInt: 4,
  neg: 3,
  mul: 2,
  div: 2,
  add: 1,
  sub: 1,
}

export function canonicalIntValue(expr: CanonicalExpr): number | null {
  if (expr.kind === 'one') {
    return 1
  }

  if (expr.kind === 'int') {
    return expr.value
  }

  return null
}

export function hasVariable(expr: CanonicalExpr): boolean {
  switch (expr.kind) {
    case 'x':
    case 'y':
      return true
    case 'one':
    case 'int':
    case 'const':
      return false
    case 'neg':
      return hasVariable(expr.value)
    case 'fn':
      return hasVariable(expr.arg)
    case 'powInt':
      return hasVariable(expr.base)
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
      return hasVariable(expr.left) || hasVariable(expr.right)
  }
}

export function canonicalSortKey(expr: CanonicalExpr): string {
  switch (expr.kind) {
    case 'one':
      return '0:1'
    case 'x':
      return '1:x'
    case 'y':
      return '2:y'
    case 'int':
      return `3:${expr.value}`
    case 'const':
      return `4:${expr.value}`
    case 'neg':
      return `5:${canonicalSortKey(expr.value)}`
    case 'fn':
      return `6:${expr.name}:${canonicalSortKey(expr.arg)}`
    case 'powInt':
      return `7:${canonicalSortKey(expr.base)}:${expr.exponent}`
    case 'mul':
      return `8:${canonicalSortKey(expr.left)}:${canonicalSortKey(expr.right)}`
    case 'div':
      return `9:${canonicalSortKey(expr.left)}:${canonicalSortKey(expr.right)}`
    case 'add':
      return `10:${canonicalSortKey(expr.left)}:${canonicalSortKey(expr.right)}`
    case 'sub':
      return `11:${canonicalSortKey(expr.left)}:${canonicalSortKey(expr.right)}`
  }
}

function normalizePair(
  kind: 'add' | 'mul',
  left: CanonicalExpr,
  right: CanonicalExpr,
): CanonicalExpr {
  const leftValue = canonicalIntValue(left)
  const rightValue = canonicalIntValue(right)

  if (leftValue !== null && rightValue !== null) {
    const total = kind === 'add' ? leftValue + rightValue : leftValue * rightValue
    return integerExpr(total)
  }

  if (kind === 'mul') {
    if (leftValue === 0 || rightValue === 0) {
      return { kind: 'int', value: 0 }
    }

    if (leftValue === 1) {
      return right
    }

    if (rightValue === 1) {
      return left
    }
  }

  if (kind === 'add') {
    if (leftValue === 0) {
      return right
    }

    if (rightValue === 0) {
      return left
    }
  }

  if (canonicalSortKey(left) > canonicalSortKey(right)) {
    return kind === 'add'
      ? { kind, left: right, right: left }
      : { kind, left: right, right: left }
  }

  return { kind, left, right }
}

export function integerExpr(value: number): CanonicalExpr {
  if (value === 1) {
    return { kind: 'one' }
  }

  return { kind: 'int', value }
}

export function normalizeCanonical(expr: CanonicalExpr): CanonicalExpr {
  switch (expr.kind) {
    case 'one':
    case 'x':
    case 'y':
    case 'const':
      return expr
    case 'int':
      return integerExpr(expr.value)
    case 'neg': {
      const value = normalizeCanonical(expr.value)
      const intValue = canonicalIntValue(value)
      if (intValue !== null) {
        return integerExpr(-intValue)
      }

      if (value.kind === 'neg') {
        return value.value
      }

      return { kind: 'neg', value }
    }
    case 'fn':
      return { kind: 'fn', name: expr.name, arg: normalizeCanonical(expr.arg) }
    case 'powInt': {
      const base = normalizeCanonical(expr.base)
      if (expr.exponent === 0) {
        return { kind: 'one' }
      }

      if (expr.exponent === 1) {
        return base
      }

      const baseValue = canonicalIntValue(base)
      if (baseValue !== null && expr.exponent >= 0) {
        return integerExpr(baseValue ** expr.exponent)
      }

      return { kind: 'powInt', base, exponent: expr.exponent }
    }
    case 'add':
      return normalizePair(
        'add',
        normalizeCanonical(expr.left),
        normalizeCanonical(expr.right),
      )
    case 'mul':
      return normalizePair(
        'mul',
        normalizeCanonical(expr.left),
        normalizeCanonical(expr.right),
      )
    case 'sub': {
      const left = normalizeCanonical(expr.left)
      const right = normalizeCanonical(expr.right)
      const leftValue = canonicalIntValue(left)
      const rightValue = canonicalIntValue(right)
      if (leftValue !== null && rightValue !== null) {
        return integerExpr(leftValue - rightValue)
      }

      if (rightValue === 0) {
        return left
      }

      return { kind: 'sub', left, right }
    }
    case 'div': {
      const left = normalizeCanonical(expr.left)
      const right = normalizeCanonical(expr.right)
      const leftValue = canonicalIntValue(left)
      const rightValue = canonicalIntValue(right)

      if (leftValue !== null && rightValue !== null && rightValue !== 0 && leftValue % rightValue === 0) {
        return integerExpr(leftValue / rightValue)
      }

      if (leftValue === 0) {
        return integerExpr(0)
      }

      if (rightValue === 1) {
        return left
      }

      return { kind: 'div', left, right }
    }
  }
}

function wrap(parentKind: CanonicalExpr['kind'], child: CanonicalExpr): string {
  if (PRECEDENCE[child.kind] < PRECEDENCE[parentKind]) {
    return `(${canonicalToString(child)})`
  }

  return canonicalToString(child)
}

export function canonicalToString(expr: CanonicalExpr): string {
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
      return expr.value
    case 'neg':
      return `-${wrap('neg', expr.value)}`
    case 'fn':
      return `${expr.name}(${canonicalToString(expr.arg)})`
    case 'powInt':
      return `${wrap('powInt', expr.base)}^${expr.exponent}`
    case 'add':
      return `${wrap('add', expr.left)} + ${wrap('add', expr.right)}`
    case 'sub':
      return `${wrap('sub', expr.left)} - ${wrap('sub', expr.right)}`
    case 'mul':
      return `${wrap('mul', expr.left)} * ${wrap('mul', expr.right)}`
    case 'div':
      return `${wrap('div', expr.left)} / ${wrap('div', expr.right)}`
  }
}

function latexWrap(parentKind: CanonicalExpr['kind'], child: CanonicalExpr): string {
  if (PRECEDENCE[child.kind] < PRECEDENCE[parentKind]) {
    return `\\left(${canonicalToLatex(child)}\\right)`
  }

  return canonicalToLatex(child)
}

export function canonicalToLatex(expr: CanonicalExpr): string {
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
      return expr.value === 'pi' ? '\\pi' : expr.value
    case 'neg':
      return `-${latexWrap('neg', expr.value)}`
    case 'fn': {
      const name = expr.name === 'ln' ? '\\ln' : `\\${expr.name}`
      return `${name}\\left(${canonicalToLatex(expr.arg)}\\right)`
    }
    case 'powInt':
      return `${latexWrap('powInt', expr.base)}^{${expr.exponent}}`
    case 'add':
      return `${latexWrap('add', expr.left)} + ${latexWrap('add', expr.right)}`
    case 'sub':
      return `${latexWrap('sub', expr.left)} - ${latexWrap('sub', expr.right)}`
    case 'mul':
      return `${latexWrap('mul', expr.left)} \\cdot ${latexWrap('mul', expr.right)}`
    case 'div':
      return `\\frac{${canonicalToLatex(expr.left)}}{${canonicalToLatex(expr.right)}}`
  }
}

export function renderKatexToHtml(latex: string): string {
  return katex.renderToString(latex, {
    displayMode: false,
    throwOnError: false,
  })
}
