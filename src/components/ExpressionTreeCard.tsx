import { hierarchy, tree } from 'd3-hierarchy'
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import type { EmlExpr, Path } from '../lib/types'

type ViewMode = 'compact' | 'expanded'
type NodeTone = 'eml' | 'macro' | 'variable' | 'constant'

type ExpressionTreeCardProps = {
  id: string
  title: string
  formula: string
  accent: string
  expr: EmlExpr
  labels: Record<Path, string>
  collapseLabels?: Record<Path, string>
  mode: ViewMode
  featured?: boolean
}

type TreeDatum = {
  path: Path
  label: string
  tone: NodeTone
  expr: EmlExpr
  children?: TreeDatum[]
}

type CollapseFrame = {
  id: string
  collapsedPaths: Set<Path>
}

type AnimationState = {
  frameIndex: number
  isPlaying: boolean
}

type AnimationAction =
  | { type: 'toggle' }
  | { type: 'tick'; maxIndex: number }
  | { type: 'replay'; autoPlay: boolean }

const CARD_FALLBACK_WIDTH = 760
const CARD_HEIGHT = 420
const FEATURED_FALLBACK_WIDTH = 1360
const FEATURED_VIEWPORT_HEIGHT = 560
const CARD_MAX_SCALE = 1.6
const CARD_MIN_SCALE = 0.22
const FEATURED_MAX_SCALE = 1.9
const FEATURED_MIN_SCALE = 0.45
const PAD_X = 72
const PAD_TOP = 52
const PAD_BOTTOM = 64
const COLLAPSE_STEP_MS = 900

function animationReducer(state: AnimationState, action: AnimationAction): AnimationState {
  switch (action.type) {
    case 'toggle':
      return { ...state, isPlaying: !state.isPlaying }
    case 'tick': {
      const nextFrameIndex = Math.min(state.frameIndex + 1, action.maxIndex)
      return {
        frameIndex: nextFrameIndex,
        isPlaying: nextFrameIndex < action.maxIndex,
      }
    }
    case 'replay':
      return {
        frameIndex: 0,
        isPlaying: action.autoPlay,
      }
  }
}

function isConstantLabel(label: string): boolean {
  return /^-?\d+$/.test(label) || label === '1' || label === 'e' || label === 'pi' || label === 'i'
}

function nodeWidth(label: string): number {
  if (label.length <= 3) {
    return 22
  }

  return Math.min(220, Math.max(48, 18 + label.length * 7.2))
}

function classifyTone(expr: EmlExpr, label: string, mode: ViewMode): NodeTone {
  if (expr.kind === 'leaf') {
    return expr.value === '1' ? 'constant' : 'variable'
  }

  if (mode === 'expanded' || label === 'E') {
    return 'eml'
  }

  if (label === 'x' || label === 'y') {
    return 'variable'
  }

  if (isConstantLabel(label)) {
    return 'constant'
  }

  return 'macro'
}

function nodeLabel(expr: EmlExpr, path: Path, labels: Record<Path, string>, mode: ViewMode): string {
  if (mode === 'expanded') {
    return expr.kind === 'leaf' ? expr.value : 'E'
  }

  return labels[path] ?? (expr.kind === 'leaf' ? expr.value : 'E')
}

function toDatum(expr: EmlExpr, path: Path, labels: Record<Path, string>, mode: ViewMode): TreeDatum {
  const label = nodeLabel(expr, path, labels, mode)

  if (expr.kind === 'leaf') {
    return {
      path,
      label,
      tone: classifyTone(expr, label, mode),
      expr,
    }
  }

  return {
    path,
    label,
    tone: classifyTone(expr, label, mode),
    expr,
    children: [
      toDatum(expr.left, `${path}L`, labels, mode),
      toDatum(expr.right, `${path}R`, labels, mode),
    ],
  }
}

function toRawDatum(expr: EmlExpr, path: Path): TreeDatum {
  const label = expr.kind === 'leaf' ? expr.value : 'E'

  if (expr.kind === 'leaf') {
    return {
      path,
      label,
      tone: classifyTone(expr, label, 'expanded'),
      expr,
    }
  }

  return {
    path,
    label,
    tone: 'eml',
    expr,
    children: [toRawDatum(expr.left, `${path}L`), toRawDatum(expr.right, `${path}R`)],
  }
}

function buildCollapseFrames(
  expr: EmlExpr,
  collapseLabels: Record<Path, string>,
  mode: ViewMode,
  featured: boolean,
): CollapseFrame[] {
  if (!featured || mode === 'expanded') {
    return [{ id: 'static', collapsedPaths: new Set<Path>() }]
  }

  const pathsByDepth = new Map<number, Path[]>()

  function visit(current: EmlExpr, path: Path) {
    if (current.kind === 'leaf') {
      return
    }

    visit(current.left, `${path}L`)
    visit(current.right, `${path}R`)

    if (collapseLabels[path] === 'E') {
      return
    }

    const bucket = pathsByDepth.get(path.length) ?? []
    bucket.push(path)
    pathsByDepth.set(path.length, bucket)
  }

  visit(expr, '')

  if (pathsByDepth.size === 0) {
    return [{ id: 'raw', collapsedPaths: new Set<Path>() }]
  }

  const frames: CollapseFrame[] = [{ id: 'raw', collapsedPaths: new Set<Path>() }]
  const collapsedPaths = new Set<Path>()
  const depths = [...pathsByDepth.keys()].sort((left, right) => right - left)

  for (const depth of depths) {
    const paths = (pathsByDepth.get(depth) ?? []).sort()
    for (const path of paths) {
      collapsedPaths.add(path)
    }

    frames.push({
      id: `collapse-${depth}`,
      collapsedPaths: new Set(collapsedPaths),
    })
  }

  return frames
}

function isHiddenByCollapsedAncestor(path: Path, collapsedPaths: Set<Path>): boolean {
  if (path === '') {
    return false
  }

  if (collapsedPaths.has('')) {
    return true
  }

  for (let index = 1; index < path.length; index += 1) {
    if (collapsedPaths.has(path.slice(0, index))) {
      return true
    }
  }

  return false
}

function renderNodeFace(label: string, tone: NodeTone) {
  const wide = label.length > 3

  return (
    <g className={`expression-card__node-layer expression-card__node--${tone} ${wide ? 'is-wide' : ''}`}>
      {wide ? (
        <rect
          x={-nodeWidth(label) / 2}
          y={-(tone === 'eml' ? 12 : 11)}
          width={nodeWidth(label)}
          height={tone === 'eml' ? 24 : 22}
          rx={tone === 'eml' ? 12 : 11}
        />
      ) : (
        <circle r={tone === 'eml' ? 11 : 10} />
      )}
      <text dy="0.35em">{label}</text>
    </g>
  )
}

export function ExpressionTreeCard({
  id,
  title,
  formula,
  accent,
  expr,
  labels,
  collapseLabels = labels,
  mode,
  featured = false,
}: ExpressionTreeCardProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [frameWidth, setFrameWidth] = useState(featured ? FEATURED_FALLBACK_WIDTH : CARD_FALLBACK_WIDTH)
  const usesAnimatedTree = featured && mode === 'compact'
  const frames = useMemo(
    () => buildCollapseFrames(expr, collapseLabels, mode, featured),
    [collapseLabels, expr, featured, mode],
  )
  const controlsEnabled = usesAnimatedTree && frames.length > 1
  const [animation, dispatchAnimation] = useReducer(animationReducer, {
    frameIndex: 0,
    isPlaying: controlsEnabled,
  })
  const currentCollapsedPaths = controlsEnabled
    ? frames[Math.min(animation.frameIndex, frames.length - 1)].collapsedPaths
    : new Set<Path>()

  useEffect(() => {
    if (!controlsEnabled || !animation.isPlaying || animation.frameIndex >= frames.length - 1) {
      return
    }

    const timeout = window.setTimeout(() => {
      dispatchAnimation({ type: 'tick', maxIndex: frames.length - 1 })
    }, COLLAPSE_STEP_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [animation.frameIndex, animation.isPlaying, controlsEnabled, frames.length])

  useEffect(() => {
    dispatchAnimation({ type: 'replay', autoPlay: controlsEnabled })
  }, [controlsEnabled, expr, mode])

  useEffect(() => {
    const element = canvasRef.current
    if (!element) {
      return
    }

    const update = () => {
      const measuredWidth = Math.max(320, Math.floor(element.clientWidth))
      const nextWidth = featured
        ? measuredWidth
        : Math.max(320, Math.min(CARD_FALLBACK_WIDTH, measuredWidth))
      if (nextWidth > 0) {
        setFrameWidth((current) => (current === nextWidth ? current : nextWidth))
      }
    }

    update()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      update()
    })
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [featured])

  const layout = useMemo(() => {
    const rootData = usesAnimatedTree ? toRawDatum(expr, '') : toDatum(expr, '', labels, mode)
    const root = hierarchy(rootData, (node) => node.children)
    const leafCount = root.leaves().length
    const depth = root.height + 1
    const widestLabelWidth = Math.max(
      ...root.descendants().map((node) => {
        if (!usesAnimatedTree) {
          return nodeWidth(node.data.label)
        }

        return Math.max(nodeWidth(node.data.label), nodeWidth(collapseLabels[node.data.path] ?? node.data.label))
      }),
    )
    const baseXSpacing = featured ? (leafCount > 22 ? 56 : 72) : 34
    const xSpacing = featured ? Math.max(baseXSpacing, Math.min(220, Math.ceil(widestLabelWidth * 1.25))) : 34
    const ySpacing = featured ? (depth > 16 ? 54 : 66) : 36
    const laidOut = tree<TreeDatum>().nodeSize([xSpacing, ySpacing])(root)
    const nodes = laidOut.descendants()
    const links = laidOut.links()

    const minX = Math.min(
      ...nodes.map((node) => {
        const rawWidth = nodeWidth(node.data.label)
        const collapsedWidth = usesAnimatedTree
          ? nodeWidth(collapseLabels[node.data.path] ?? node.data.label)
          : rawWidth
        return node.x - Math.max(rawWidth, collapsedWidth) / 2
      }),
    )
    const maxX = Math.max(
      ...nodes.map((node) => {
        const rawWidth = nodeWidth(node.data.label)
        const collapsedWidth = usesAnimatedTree
          ? nodeWidth(collapseLabels[node.data.path] ?? node.data.label)
          : rawWidth
        return node.x + Math.max(rawWidth, collapsedWidth) / 2
      }),
    )
    const minY = Math.min(...nodes.map((node) => node.y - 12))
    const maxY = Math.max(...nodes.map((node) => node.y + 12))
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const viewportWidth = frameWidth
    const viewportHeight = featured ? FEATURED_VIEWPORT_HEIGHT : CARD_HEIGHT
    const fitScaleX = (viewportWidth - PAD_X * 2) / spanX
    const fitScaleY = (viewportHeight - PAD_TOP - PAD_BOTTOM) / spanY
    const minScale = featured ? FEATURED_MIN_SCALE : CARD_MIN_SCALE
    const maxScale = featured ? FEATURED_MAX_SCALE : CARD_MAX_SCALE
    const scale = Math.min(maxScale, Math.max(minScale, Math.min(fitScaleX, fitScaleY)))
    const canvasWidth = viewportWidth
    const canvasHeight = viewportHeight
    const scaledSpanY = spanY * scale
    const verticalInset = Math.max(0, (viewportHeight - (scaledSpanY + PAD_TOP + PAD_BOTTOM)) / 2)
    const translateX = viewportWidth / 2 - ((minX + maxX) / 2) * scale
    const translateY = PAD_TOP + verticalInset - minY * scale
    return {
      canvasHeight,
      canvasWidth,
      links,
      nodes,
      scale,
      transform: `translate(${translateX} ${translateY})`,
    }
  }, [collapseLabels, expr, featured, frameWidth, labels, mode, usesAnimatedTree])

  const cardStyle = {
    '--card-accent': accent,
  } as CSSProperties

  return (
    <article
      className={`expression-card ${featured ? 'is-featured' : ''}`}
      data-testid={`operation-card-${id}`}
      style={cardStyle}
      aria-label={`${title} expression tree`}
    >
      {controlsEnabled ? (
        <div className="expression-card__controls">
          <div className="expression-card__status">
            <span>Collapse</span>
            <strong data-testid={`collapse-frame-label-${id}`}>
              {animation.frameIndex + 1} / {frames.length}
            </strong>
          </div>
          <div className="expression-card__actions">
            <button
              type="button"
              className="expression-card__control"
              data-testid={`collapse-play-toggle-${id}`}
              aria-label={`${animation.isPlaying ? 'Pause' : 'Play'} collapse`}
              onClick={() => dispatchAnimation({ type: 'toggle' })}
            >
              {animation.isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="expression-card__control"
              data-testid={`collapse-replay-${id}`}
              aria-label="Replay collapse"
              onClick={() => dispatchAnimation({ type: 'replay', autoPlay: true })}
            >
              Replay
            </button>
          </div>
        </div>
      ) : null}

      <div className="expression-card__canvas" ref={canvasRef}>
        <svg
          className="expression-card__tree"
          width={layout.canvasWidth}
          height={layout.canvasHeight}
          role="img"
          aria-label={`${formula} expression tree`}
        >
          <g transform={layout.transform}>
            {layout.links.map((link) => {
              const hidden = controlsEnabled
                ? isHiddenByCollapsedAncestor(link.target.data.path, currentCollapsedPaths)
                : false

              return (
                <path
                  key={`${link.source.data.path}-${link.target.data.path}`}
                  className={`expression-card__link ${hidden ? 'is-hidden' : ''}`}
                  d={`M${link.source.x * layout.scale},${link.source.y * layout.scale} C${link.source.x * layout.scale},${((link.source.y + link.target.y) / 2) * layout.scale} ${link.target.x * layout.scale},${((link.source.y + link.target.y) / 2) * layout.scale} ${link.target.x * layout.scale},${link.target.y * layout.scale}`}
                />
              )
            })}

            {layout.nodes.map((node) => {
              const path = node.data.path
              const rawLabel = node.data.label
              const collapsedLabel = collapseLabels[path] ?? rawLabel
              const hidden = controlsEnabled ? isHiddenByCollapsedAncestor(path, currentCollapsedPaths) : false
              const collapsedSelf = controlsEnabled && currentCollapsedPaths.has(path) && collapsedLabel !== rawLabel
              const collapsedTone = classifyTone(node.data.expr, collapsedLabel, 'compact')

              return (
                <g
                  key={path || 'root'}
                  transform={`translate(${node.x * layout.scale}, ${node.y * layout.scale})`}
                  className={`expression-card__node ${hidden ? 'is-hidden' : ''}`}
                >
                  {!controlsEnabled ? (
                    renderNodeFace(rawLabel, node.data.tone)
                  ) : (
                    <g className={collapsedSelf ? 'is-hidden' : 'is-visible'}>
                      {renderNodeFace(rawLabel, node.data.tone)}
                    </g>
                  )}
                  {controlsEnabled && collapsedLabel !== rawLabel ? (
                    <g className={collapsedSelf ? 'is-visible' : 'is-hidden'}>
                      {renderNodeFace(collapsedLabel, collapsedTone)}
                    </g>
                  ) : null}
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </article>
  )
}
