import katex from 'katex'
import type { DraftNode, EmlExpr, Path } from './types'

export function hole(): DraftNode {
  return { kind: 'hole' }
}

export function leaf(value: '1' | 'x' | 'y'): EmlExpr {
  return { kind: 'leaf', value }
}

export function eml(left: EmlExpr, right: EmlExpr): EmlExpr {
  return { kind: 'eml', left, right }
}

export function isHole(node: DraftNode): node is { kind: 'hole' } {
  return node.kind === 'hole'
}

export function isCompleteDraft(node: DraftNode): node is EmlExpr {
  if (isHole(node)) {
    return false
  }

  if (node.kind === 'leaf') {
    return true
  }

  return isCompleteDraft(node.left) && isCompleteDraft(node.right)
}

export function cloneDraft(node: DraftNode): DraftNode {
  if (isHole(node)) {
    return hole()
  }

  if (node.kind === 'leaf') {
    return leaf(node.value)
  }

  return {
    kind: 'eml',
    left: cloneDraft(node.left),
    right: cloneDraft(node.right),
  }
}

export function emlEquals(leftNode: EmlExpr, rightNode: EmlExpr): boolean {
  if (leftNode.kind !== rightNode.kind) {
    return false
  }

  if (leftNode.kind === 'leaf' && rightNode.kind === 'leaf') {
    return leftNode.value === rightNode.value
  }

  if (leftNode.kind === 'eml' && rightNode.kind === 'eml') {
    return emlEquals(leftNode.left, rightNode.left) && emlEquals(leftNode.right, rightNode.right)
  }

  return false
}

export function emlToString(node: EmlExpr): string {
  if (node.kind === 'leaf') {
    return node.value
  }

  return `eml(${emlToString(node.left)}, ${emlToString(node.right)})`
}

export function emlToIndentedString(node: EmlExpr, indent = 0): string {
  if (node.kind === 'leaf') {
    return node.value
  }

  const pad = ' '.repeat(indent)
  const childPad = ' '.repeat(indent + 2)

  return [
    'eml(',
    `${childPad}${emlToIndentedString(node.left, indent + 2)},`,
    `${childPad}${emlToIndentedString(node.right, indent + 2)}`,
    `${pad})`,
  ].join('\n')
}

export function emlToLatex(node: EmlExpr): string {
  if (node.kind === 'leaf') {
    return node.value
  }

  return `\\operatorname{eml}\\left(${emlToLatex(node.left)}, ${emlToLatex(node.right)}\\right)`
}

export function renderEmlKatex(node: EmlExpr): string {
  return katex.renderToString(emlToLatex(node), {
    displayMode: false,
    throwOnError: false,
  })
}

export function getDraftAtPath(node: DraftNode, path: Path): DraftNode | null {
  if (path === '') {
    return node
  }

  if (isHole(node) || node.kind === 'leaf') {
    return null
  }

  const [head, ...tail] = path.split('')
  return getDraftAtPath(head === 'L' ? node.left : node.right, tail.join(''))
}

export function replaceDraftAtPath(
  node: DraftNode,
  path: Path,
  value: DraftNode,
): DraftNode {
  if (path === '') {
    return cloneDraft(value)
  }

  if (isHole(node) || node.kind === 'leaf') {
    return cloneDraft(node)
  }

  const [head, ...tail] = path.split('')
  if (head === 'L') {
    return {
      kind: 'eml',
      left: replaceDraftAtPath(node.left, tail.join(''), value),
      right: cloneDraft(node.right),
    }
  }

  return {
    kind: 'eml',
    left: cloneDraft(node.left),
    right: replaceDraftAtPath(node.right, tail.join(''), value),
  }
}

export function hasVariableLeaf(node: DraftNode, value?: 'x' | 'y'): boolean {
  if (isHole(node)) {
    return false
  }

  if (node.kind === 'leaf') {
    return value ? node.value === value : node.value !== '1'
  }

  return hasVariableLeaf(node.left, value) || hasVariableLeaf(node.right, value)
}

export function listSubtrees(node: EmlExpr): Array<{ path: Path; expr: EmlExpr }> {
  const entries: Array<{ path: Path; expr: EmlExpr }> = []

  function visit(current: EmlExpr, path: Path) {
    entries.push({ path, expr: current })

    if (current.kind === 'eml') {
      visit(current.left, `${path}L`)
      visit(current.right, `${path}R`)
    }
  }

  visit(node, '')
  return entries
}
