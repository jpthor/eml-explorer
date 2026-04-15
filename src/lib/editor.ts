import { getDraftAtPath, hole, isHole, replaceDraftAtPath } from './emlAst'
import type { DraftNode, EmlLeafValue, Path } from './types'

export function insertLeafValue(root: DraftNode, path: Path, value: EmlLeafValue): DraftNode {
  const target = getNode(root, path)
  if (!target || !isHole(target)) {
    return root
  }

  return replaceDraftAtPath(root, path, { kind: 'leaf', value })
}

export function insertOne(root: DraftNode, path: Path): DraftNode {
  return insertLeafValue(root, path, '1')
}

export function insertVariable(root: DraftNode, path: Path, value: Exclude<EmlLeafValue, '1'> = 'x'): DraftNode {
  return insertLeafValue(root, path, value)
}

export function insertEml(root: DraftNode, path: Path): DraftNode {
  const target = getNode(root, path)
  if (!target || !isHole(target)) {
    return root
  }

  return replaceDraftAtPath(root, path, {
    kind: 'eml',
    left: hole(),
    right: hole(),
  })
}

export function addEmptyWrap(
  root: DraftNode,
  path: Path,
  side: 'left' | 'right',
): DraftNode {
  const target = getNode(root, path)
  if (!target || isHole(target)) {
    return root
  }

  const wrapped =
    side === 'left'
      ? {
          kind: 'eml' as const,
          left: target,
          right: hole(),
        }
      : {
          kind: 'eml' as const,
          left: hole(),
          right: target,
        }

  return replaceDraftAtPath(root, path, wrapped)
}

export function getNode(root: DraftNode, path: Path): DraftNode | null {
  return getDraftAtPath(root, path)
}
