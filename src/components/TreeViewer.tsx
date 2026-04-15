import { hierarchy, tree, type HierarchyPointLink, type HierarchyPointNode } from 'd3-hierarchy'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { DraftNode, Path } from '../lib/types'

type TreeViewerProps = {
  root: DraftNode
  selectedPath: Path
  onSelect: (path: Path) => void
  selectedIsHole?: boolean
  onInsertOne?: () => void
  onInsertVariable?: () => void
  onInsertEml?: () => void
}

type TreeDatum = {
  path: Path
  label: string
  tone: 'hole' | 'leaf' | 'branch'
  children?: TreeDatum[]
}

const WIDTH = 760
const HEIGHT = 500
const PAD_X = 72
const PAD_Y = 60
const MIN_SCALE = 0.45
const MAX_SCALE = 1.9

function toDatum(node: DraftNode, path: Path): TreeDatum {
  if (node.kind === 'hole') {
    return {
      path,
      label: '□',
      tone: 'hole',
    }
  }

  if (node.kind === 'leaf') {
    return {
      path,
      label: node.value,
      tone: 'leaf',
    }
  }

  return {
    path,
    label: 'eml',
    tone: 'branch',
    children: [toDatum(node.left, `${path}L`), toDatum(node.right, `${path}R`)],
  }
}

function fitView(rootNode: HierarchyPointNode<TreeDatum>) {
  const nodes = rootNode.descendants()
  const minHorizontal = Math.min(...nodes.map((node) => node.y - 24))
  const maxHorizontal = Math.max(...nodes.map((node) => node.y + (node.data.tone === 'branch' ? 28 : 24)))
  const minVertical = Math.min(...nodes.map((node) => node.x - 28))
  const maxVertical = Math.max(...nodes.map((node) => node.x + 28))
  const spanHorizontal = Math.max(1, maxHorizontal - minHorizontal)
  const spanVertical = Math.max(1, maxVertical - minVertical)
  const scale = Math.max(
    MIN_SCALE,
    Math.min(
      MAX_SCALE,
      Math.min((WIDTH - PAD_X * 2) / spanHorizontal, (HEIGHT - PAD_Y * 2) / spanVertical),
    ),
  )

  return {
    x: WIDTH / 2 - ((minHorizontal + maxHorizontal) / 2) * scale,
    y: HEIGHT / 2 - ((minVertical + maxVertical) / 2) * scale,
    scale,
  }
}

export function TreeViewer({
  root,
  selectedPath,
  onSelect,
  selectedIsHole = false,
  onInsertOne,
  onInsertVariable,
  onInsertEml,
}: TreeViewerProps) {
  const [view, setView] = useState(() => ({ x: WIDTH / 2, y: HEIGHT / 2, scale: 1 }))
  const dragState = useRef<{
    pointerId: number
    originX: number
    originY: number
    startX: number
    startY: number
  } | null>(null)

  const layout = useMemo(() => {
    const rootNode = hierarchy(toDatum(root, ''), (node) => node.children)
    return tree<TreeDatum>().nodeSize([78, 132])(rootNode)
  }, [root])

  const links = layout.links()
  const nodes = layout.descendants()

  const defaultView = useMemo(() => fitView(layout), [layout])

  // Reframe whenever the tree shape changes so new children stay in view.
  // This keeps builder inserts visible without requiring a manual reset.
  useEffect(() => {
    setView(defaultView)
  }, [defaultView])

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    const target = event.target as Element | null
    if (target?.closest('.tree-node')) {
      return
    }

    dragState.current = {
      pointerId: event.pointerId,
      originX: view.x,
      originY: view.y,
      startX: event.clientX,
      startY: event.clientY,
    }
    if ('setPointerCapture' in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragState.current || dragState.current.pointerId !== event.pointerId) {
      return
    }

    setView((current) => ({
      ...current,
      x: dragState.current!.originX + event.clientX - dragState.current!.startX,
      y: dragState.current!.originY + event.clientY - dragState.current!.startY,
    }))
  }

  function finishDrag(event: PointerEvent<SVGSVGElement>) {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null
      if ('releasePointerCapture' in event.currentTarget) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }
  }

  function zoom(delta: number) {
    setView((current) => ({
      ...current,
      scale: Math.min(2.3, Math.max(0.45, current.scale + delta)),
    }))
  }

  return (
    <div className="tree-shell">
      <div className="tree-toolbar">
        <div>
          <strong>Binary Tree</strong>
          <span>
            {selectedIsHole
              ? 'Selected hole ready. Add directly here or use the sidebar controls.'
              : 'Click a node to select it, then fill holes or wrap branches.'}
          </span>
        </div>
        <div className="tree-toolbar__actions">
          {selectedIsHole && onInsertOne ? (
            <button type="button" data-testid="tree-quick-add-one" onClick={onInsertOne}>
              Add 1
            </button>
          ) : null}
          {selectedIsHole && onInsertVariable ? (
            <button type="button" data-testid="tree-quick-add-x" onClick={onInsertVariable}>
              Add x
            </button>
          ) : null}
          {selectedIsHole && onInsertEml ? (
            <button type="button" data-testid="tree-quick-add-eml" onClick={onInsertEml}>
              Add eml
            </button>
          ) : null}
          <button type="button" onClick={() => zoom(-0.12)}>
            -
          </button>
          <button type="button" onClick={() => zoom(0.12)}>
            +
          </button>
          <button
            type="button"
            onClick={() => setView(defaultView)}
          >
            Reset view
          </button>
        </div>
      </div>

      <svg
        className="tree-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerLeave={finishDrag}
        onWheel={(event) => {
          event.preventDefault()
          zoom(event.deltaY > 0 ? -0.06 : 0.06)
        }}
      >
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} rx="24" className="tree-surface" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {links.map((link: HierarchyPointLink<TreeDatum>) => (
            <path
              key={`${link.source.data.path}-${link.target.data.path}`}
              d={`M${link.source.y},${link.source.x} C${link.source.y + 58},${link.source.x} ${link.target.y - 58},${link.target.x} ${link.target.y},${link.target.x}`}
              className="tree-link"
            />
          ))}

          {nodes.map((node: HierarchyPointNode<TreeDatum>) => (
            <g
              key={node.data.path || 'root'}
              transform={`translate(${node.y}, ${node.x})`}
              className={`tree-node tree-node--${node.data.tone} ${node.data.path === selectedPath ? 'is-selected' : ''}`}
              data-testid={`tree-node-${node.data.path || 'root'}`}
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(node.data.path)
              }}
            >
              <circle r={node.data.tone === 'branch' ? 24 : 20} />
              <text dy="0.35em">{node.data.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
