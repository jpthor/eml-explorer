import { startTransition, useEffect, useMemo, useReducer } from 'react'
import './App.css'
import { ExpressionTreeCard } from './components/ExpressionTreeCard'
import { ManualBuilderPanel } from './components/ManualBuilderPanel'
import { RegressionPanel } from './components/RegressionPanel'
import { compareEvaluations, compileInputToEml } from './lib/engine'
import { hasVariableLeaf } from './lib/emlAst'
import { buildLabelSets } from './lib/labels'
import type { EmlExpr } from './lib/types'

type ViewMode = 'compact' | 'expanded'
type ActivePanel = 'explorer' | 'builder' | 'regression'

type State = {
  tree: EmlExpr
  importText: string
  error: string | null
  mode: ViewMode
  panel: ActivePanel
}

type Action =
  | { type: 'setImportText'; value: string }
  | { type: 'setMode'; value: ViewMode }
  | { type: 'setPanel'; value: ActivePanel }
  | { type: 'importSuccess'; value: EmlExpr; sourceText: string }
  | { type: 'setError'; value: string | null }

const PRESET_DEFINITIONS = [
  { id: 'add-xy', title: 'x + y', formula: 'x + y', accent: 'var(--card-pink)' },
  { id: 'sub-xy', title: 'x - y', formula: 'x - y', accent: 'var(--card-teal)' },
  { id: 'mul-xy', title: 'x × y', formula: 'x * y', accent: 'var(--card-cyan)' },
  { id: 'div-xy', title: 'x / y', formula: 'x / y', accent: 'var(--card-lime)' },
  { id: 'square', title: 'x^2', formula: 'x^2', accent: 'var(--card-violet)' },
  { id: 'pow', title: 'x^3', formula: 'x^3', accent: 'var(--card-orange)' },
  { id: 'zero', title: '0', formula: '1 - 1', accent: 'var(--card-slate)' },
  { id: 'e', title: 'e', formula: 'e', accent: 'var(--card-amber)' },
  { id: 'pi', title: 'pi', formula: 'pi', accent: 'var(--card-featured)' },
  { id: 'neg', title: '-x', formula: '-x', accent: 'var(--card-gold)' },
  { id: 'inv', title: '1/x', formula: '1 / x', accent: 'var(--card-violet)' },
  { id: 'exp', title: 'exp(x)', formula: 'exp(x)', accent: 'var(--card-coral)' },
  { id: 'ln', title: 'ln(x)', formula: 'ln(x)', accent: 'var(--card-sky)' },
  { id: 'sqrt', title: 'sqrt(x)', formula: 'sqrt(x)', accent: 'var(--card-amber)' },
  { id: 'sin', title: 'sin(x)', formula: 'sin(x)', accent: 'var(--card-rose)' },
  { id: 'cos', title: 'cos(x)', formula: 'cos(x)', accent: 'var(--card-coral)' },
] as const

const START_FORMULA = 'x + y'
const START_COMPILED = compileInputToEml(START_FORMULA)

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setImportText':
      return { ...state, importText: action.value }
    case 'setMode':
      return { ...state, mode: action.value }
    case 'setPanel':
      return { ...state, panel: action.value }
    case 'setError':
      return { ...state, error: action.value }
    case 'importSuccess':
      return {
        ...state,
        tree: action.value,
        importText: action.sourceText,
        error: null,
      }
    default:
      return state
  }
}

const initialState: State = {
  tree: START_COMPILED.eml,
  importText: START_FORMULA,
  error: null,
  mode: 'compact',
  panel: 'explorer',
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const importedCard = useMemo(() => {
    const { labels, collapseLabels } = buildLabelSets(state.tree)

    return {
      id: 'imported',
      title: state.importText || 'Current formula',
      formula: state.importText || 'Current formula',
      accent: 'var(--card-featured)',
      expr: state.tree,
      labels,
      collapseLabels,
    }
  }, [state.importText, state.tree])

  const hasVariables = hasVariableLeaf(state.tree)
  const evaluation = hasVariables ? null : compareEvaluations(state.tree, 0, 0)

  useEffect(() => {
    startTransition(() => {
      try {
        const compiled = compileInputToEml(state.importText)
        dispatch({
          type: 'importSuccess',
          value: compiled.eml,
          sourceText: state.importText,
        })
      } catch (error) {
        dispatch({
          type: 'setError',
          value: error instanceof Error ? error.message : 'Import failed.',
        })
      }
    })
  }, [state.importText])

  function applyFormula(formula: string) {
    dispatch({ type: 'setImportText', value: formula })
    dispatch({ type: 'setError', value: null })
    dispatch({ type: 'setPanel', value: 'explorer' })
  }

  return (
    <main className="app-shell app-shell--gallery">
      <section className="panel-frame app-bar">
        <div className="control-topbar">
          <h1>EML Explorer</h1>
          <p>Import formulas, build trees by hand, or search for a matching EML witness.</p>
        </div>

        <div className="app-tabs" role="tablist" aria-label="EML modes">
          <button
            type="button"
            data-testid="tab-explorer"
            className={`app-tabs__button ${state.panel === 'explorer' ? 'is-active' : ''}`}
            onClick={() => dispatch({ type: 'setPanel', value: 'explorer' })}
          >
            Explorer
          </button>
          <button
            type="button"
            data-testid="tab-builder"
            className={`app-tabs__button ${state.panel === 'builder' ? 'is-active' : ''}`}
            onClick={() => dispatch({ type: 'setPanel', value: 'builder' })}
          >
            Builder
          </button>
          <button
            type="button"
            data-testid="tab-regression"
            className={`app-tabs__button ${state.panel === 'regression' ? 'is-active' : ''}`}
            onClick={() => dispatch({ type: 'setPanel', value: 'regression' })}
          >
            Regression
          </button>
        </div>
      </section>

      {state.panel === 'explorer' ? (
        <>
          <section className="control-deck">
            <div className="control-deck__group">
              <p className="panel-kicker">Presets</p>
              <div className="operation-grid">
                {PRESET_DEFINITIONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="operation-button"
                    data-testid={`preset-button-${preset.id}`}
                    onClick={() => applyFormula(preset.formula)}
                  >
                    {preset.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="formula-builder">
              <label className="field field--wide">
                <span>Function input</span>
                <input
                  data-testid="import-input"
                  value={state.importText}
                  onChange={(event) => dispatch({ type: 'setImportText', value: event.target.value })}
                  placeholder="2 + 2"
                />
              </label>
            </div>

            {state.error && <p className="status-line is-error">{state.error}</p>}
          </section>

          <section className="gallery-panel">
            <div className="gallery-panel__header">
              <div>
                <h2 data-testid="gallery-title">{state.importText}</h2>
                <p className="gallery-panel__copy">
                  {evaluation?.canonicalResult
                    ? `Evaluates to ${evaluation.canonicalResult.display}.`
                    : 'Symbolic tree only.'}
                </p>
              </div>

              <div className="mode-toggle" role="tablist" aria-label="Tree display mode">
                <button
                  type="button"
                  data-testid="mode-compact"
                  className={`mode-toggle__button ${state.mode === 'compact' ? 'is-active' : ''}`}
                  onClick={() => dispatch({ type: 'setMode', value: 'compact' })}
                >
                  Compact
                </button>
                <button
                  type="button"
                  data-testid="mode-expanded"
                  className={`mode-toggle__button ${state.mode === 'expanded' ? 'is-active' : ''}`}
                  onClick={() => dispatch({ type: 'setMode', value: 'expanded' })}
                >
                  Expanded
                </button>
              </div>
            </div>

            <div className="gallery-grid gallery-grid--single">
              <ExpressionTreeCard
                key={`explorer-${state.mode}-${JSON.stringify(importedCard.expr)}`}
                id={importedCard.id}
                title={importedCard.title}
                formula={importedCard.formula}
                accent={importedCard.accent}
                expr={importedCard.expr}
                labels={importedCard.labels}
                collapseLabels={importedCard.collapseLabels}
                mode={state.mode}
                featured
              />
            </div>
          </section>
        </>
      ) : null}

      {state.panel === 'builder' ? <ManualBuilderPanel onAdoptFormula={applyFormula} /> : null}
      {state.panel === 'regression' ? <RegressionPanel onAdoptFormula={applyFormula} /> : null}
    </main>
  )
}

export default App
