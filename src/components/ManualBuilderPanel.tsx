import { useMemo, useReducer, useState } from 'react'
import { canonicalToString } from '../lib/canonical'
import { addEmptyWrap, getNode, insertEml, insertOne, insertVariable } from '../lib/editor'
import { cloneDraft, emlToIndentedString, hasVariableLeaf, hole, isCompleteDraft, isHole } from '../lib/emlAst'
import { compareEvaluations, recognizeExpression } from '../lib/engine'
import { TreeViewer } from './TreeViewer'
import { CodeBlock } from './CodeBlock'
import { LineChart, type LineChartSeries } from './LineChart'
import type { DraftNode, EmlExpr, Path } from '../lib/types'

type ManualBuilderPanelProps = {
  onAdoptFormula: (formula: string) => void
}

type BuilderState = {
  draft: DraftNode
  selectedPath: Path
  history: DraftNode[]
  notice: string | null
}

type BuilderAction =
  | { type: 'select'; path: Path }
  | { type: 'replace'; draft: DraftNode; selectedPath: Path; notice?: string | null }
  | { type: 'undo' }
  | { type: 'reset' }
  | { type: 'notice'; notice: string | null }

const initialBuilderState: BuilderState = {
  draft: hole(),
  selectedPath: '',
  history: [],
  notice: null,
}

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'select':
      return { ...state, selectedPath: action.path }
    case 'replace':
      return {
        draft: action.draft,
        selectedPath: action.selectedPath,
        history: [...state.history, cloneDraft(state.draft)],
        notice: action.notice ?? null,
      }
    case 'undo': {
      const previous = state.history.at(-1)
      if (!previous) {
        return state
      }

      return {
        draft: previous,
        selectedPath: '',
        history: state.history.slice(0, -1),
        notice: 'Undid the last builder step.',
      }
    }
    case 'reset':
      return initialBuilderState
    case 'notice':
      return { ...state, notice: action.notice }
  }
}

function holeCount(node: DraftNode): number {
  if (isHole(node)) {
    return 1
  }

  if (node.kind === 'leaf') {
    return 0
  }

  return holeCount(node.left) + holeCount(node.right)
}

function buildPlot(expr: EmlExpr): LineChartSeries {
  const points: Array<{ x: number; y: number | null }> = []
  for (let index = 0; index <= 180; index += 1) {
    const x = -4 + (index / 180) * 8
    const result = compareEvaluations(expr, x).emlResult
    points.push({
      x,
      y: result.kind === 'real' ? Number.parseFloat(result.display) : null,
    })
  }

  return {
    label: 'f(x)',
    color: '#43c7ff',
    points,
  }
}

export function ManualBuilderPanel({ onAdoptFormula }: ManualBuilderPanelProps) {
  const [state, dispatch] = useReducer(builderReducer, initialBuilderState)
  const [xSample, setXSample] = useState('0')

  const selectedNode = getNode(state.draft, state.selectedPath)
  const selectedIsHole = selectedNode ? isHole(selectedNode) : false
  const selectedIsBranch = selectedNode ? !isHole(selectedNode) : false
  const completeExpr = isCompleteDraft(state.draft) ? state.draft : null
  const recognition = completeExpr ? recognizeExpression(completeExpr) : null
  const canonicalLabel = recognition?.canonical ? canonicalToString(recognition.canonical) : null
  const xValue = Number.parseFloat(xSample)
  const evaluation =
    completeExpr && Number.isFinite(xValue) ? compareEvaluations(completeExpr, xValue) : null
  const plotSeries = useMemo(() => (completeExpr ? buildPlot(completeExpr) : null), [completeExpr])
  const openSlots = holeCount(state.draft)

  function applyBuilderUpdate(nextDraft: DraftNode, nextSelection: Path, notice?: string | null) {
    if (nextDraft === state.draft) {
      return
    }

    dispatch({ type: 'replace', draft: nextDraft, selectedPath: nextSelection, notice })
  }

  function handleSimplify() {
    if (!canonicalLabel) {
      dispatch({
        type: 'notice',
        notice: completeExpr ? 'No named formula matched yet.' : 'Finish the tree before simplifying.',
      })
      return
    }

    onAdoptFormula(canonicalLabel)
    dispatch({
      type: 'notice',
      notice: `Loaded ${canonicalLabel} into the explorer.`,
    })
  }

  function addOne() {
    applyBuilderUpdate(insertOne(state.draft, state.selectedPath), state.selectedPath, 'Inserted 1.')
  }

  function addVariable() {
    applyBuilderUpdate(
      insertVariable(state.draft, state.selectedPath, 'x'),
      state.selectedPath,
      'Inserted x.',
    )
  }

  function addEml() {
    applyBuilderUpdate(
      insertEml(state.draft, state.selectedPath),
      `${state.selectedPath}L`,
      'Inserted eml with two fresh holes.',
    )
  }

  function wrapSelected(side: 'left' | 'right') {
    const nextSelection = `${state.selectedPath}${side === 'left' ? 'R' : 'L'}`
    applyBuilderUpdate(addEmptyWrap(state.draft, state.selectedPath, side), nextSelection)
  }

  return (
    <section className="builder-panel panel-frame" data-testid="builder-panel">
      <aside className="builder-sidebar">
        <div className="panel-head">
          <p className="panel-kicker">Manual Tree Builder</p>
          <h2>Build with only `1` and `eml`</h2>
          <p className="panel-copy">
            Pick a hole, insert a primitive, and watch the full EML tree collapse back into named math.
          </p>
        </div>

        <div className="builder-actions">
          <button
            type="button"
            className="action-button action-button--primary"
            data-testid="builder-add-one"
            disabled={!selectedIsHole}
            onClick={addOne}
          >
            Add 1
          </button>
          <button
            type="button"
            className="action-button action-button--primary"
            data-testid="builder-add-eml"
            disabled={!selectedIsHole}
            onClick={addEml}
          >
            Add eml
          </button>
          <button
            type="button"
            className="action-button"
            data-testid="builder-add-x"
            disabled={!selectedIsHole}
            onClick={addVariable}
          >
            Add x
          </button>
          <button
            type="button"
            className="action-button"
            disabled={!selectedIsBranch}
            onClick={() => wrapSelected('left')}
          >
            Wrap left
          </button>
          <button
            type="button"
            className="action-button"
            disabled={!selectedIsBranch}
            onClick={() => wrapSelected('right')}
          >
            Wrap right
          </button>
          <button type="button" className="action-button" onClick={() => dispatch({ type: 'undo' })}>
            Undo
          </button>
          <button type="button" className="action-button" onClick={() => dispatch({ type: 'reset' })}>
            Reset
          </button>
          <button
            type="button"
            className="action-button action-button--accent"
            data-testid="builder-simplify"
            onClick={handleSimplify}
          >
            Simplify
          </button>
        </div>

        <div className="builder-meta">
          <div className="info-chip">Selected: {state.selectedPath || 'root'}</div>
          <div className="info-chip">{openSlots} open slot{openSlots === 1 ? '' : 's'}</div>
        </div>

        <label className="field">
          <span>Sample x</span>
          <input
            data-testid="builder-x-input"
            value={xSample}
            onChange={(event) => setXSample(event.target.value)}
            placeholder="0"
          />
        </label>

        {state.notice ? <p className="status-line builder-status">{state.notice}</p> : null}

        <div className="insight-card">
          <p className="panel-kicker">Raw EML</p>
          <CodeBlock
            className="builder-code"
            testId="builder-raw-eml"
            text={completeExpr ? emlToIndentedString(completeExpr) : 'Fill every hole to emit a complete EML tree.'}
          />
        </div>

        <div className="insight-card">
          <p className="panel-kicker">Simplified</p>
          <p className="builder-formula" data-testid="builder-simplified">
            {canonicalLabel ?? 'No named formula yet'}
          </p>
          <p className="builder-eval">
            {evaluation?.canonicalResult
              ? `At x = ${xSample || '0'}, f(x) = ${evaluation.canonicalResult.display}`
              : hasVariableLeaf(state.draft, 'x')
                ? 'Complete the tree to evaluate the variable branch.'
                : 'Closed trees evaluate as soon as the last hole is filled.'}
          </p>
        </div>
      </aside>

      <div className="builder-stage">
        <div className="builder-canvas">
          <TreeViewer
            root={state.draft}
            selectedPath={state.selectedPath}
            onSelect={(path) => dispatch({ type: 'select', path })}
            selectedIsHole={selectedIsHole}
            onInsertOne={selectedIsHole ? addOne : undefined}
            onInsertVariable={selectedIsHole ? addVariable : undefined}
            onInsertEml={selectedIsHole ? addEml : undefined}
          />
        </div>

        <div className="plot-card">
          <div className="plot-card__header">
            <div>
              <p className="panel-kicker">Numerical Plot</p>
              <h3>{canonicalLabel ?? 'Incomplete tree'}</h3>
            </div>
          </div>

          {plotSeries ? (
            <LineChart datasets={[plotSeries]} xLabel="x" yLabel="f(x)" />
          ) : (
            <p className="plot-placeholder">Finish the binary tree to plot its real-valued behavior over x.</p>
          )}
        </div>
      </div>
    </section>
  )
}
