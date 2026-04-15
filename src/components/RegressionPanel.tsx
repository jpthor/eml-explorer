import { useMemo, useRef, useState } from 'react'
import { ExpressionTreeCard } from './ExpressionTreeCard'
import { LineChart, type LineChartSeries } from './LineChart'
import { buildLabels } from '../lib/labels'
import { evaluateCanonical } from '../lib/engine'
import {
  MAX_REGRESSION_COMPLEXITY,
  createSimulatedRegressionDataset,
  listRegressionCandidates,
  scoreCandidate,
  type RegressionCandidate,
  type RegressionSample,
  type SimulatedRegressionDataset,
} from '../lib/regression'

type RegressionPanelProps = {
  onAdoptFormula: (formula: string) => void
}

const EXACT_RECOVERY_THRESHOLD = 1e-10
const SEARCH_ROUNDS = 2

function buildCoarseSamples(samples: RegressionSample[]) {
  if (samples.length <= 48) {
    return samples
  }

  const coarse = samples.filter((_, index) => index % 2 === 0)
  return coarse.length > 0 ? coarse : samples
}

function predictionSeries(
  samples: RegressionSample[],
  candidate: RegressionCandidate | null,
): LineChartSeries[] {
  const target: LineChartSeries = {
    label: 'Data',
    color: '#ffcc6f',
    points: samples.map((sample) => ({ x: sample.x, y: sample.y })),
  }

  if (!candidate) {
    return [target]
  }

  const fitted: LineChartSeries = {
    label: 'Fit',
    color: '#43c7ff',
    points: samples.map((sample) => {
      const value = scorePoint(candidate, sample.x)
      return {
        x: sample.x,
        y: value,
      }
    }),
    dashed: true,
  }

  return [target, fitted]
}

function scorePoint(candidate: RegressionCandidate, x: number): number | null {
  const result = evaluateCanonical(candidate.canonical, x)
  if (result.kind !== 'real') {
    return null
  }

  const numeric = Number.parseFloat(result.display)
  return Number.isFinite(numeric) ? numeric : null
}

export function RegressionPanel({ onAdoptFormula }: RegressionPanelProps) {
  const [complexity, setComplexity] = useState(5)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [lossHistory, setLossHistory] = useState<Array<{ x: number; y: number | null }>>([])
  const [progress, setProgress] = useState({ tried: 0, total: 0 })
  const [best, setBest] = useState<{ candidate: RegressionCandidate; loss: number } | null>(null)
  const [simulatedDataset, setSimulatedDataset] = useState<SimulatedRegressionDataset | null>(null)
  const runTokenRef = useRef(0)

  const samples = useMemo(() => simulatedDataset?.samples ?? [], [simulatedDataset])
  const datasetSummary = simulatedDataset ? simulatedDataset.sourceFormula : 'No data'

  const regressionPlot = useMemo(() => predictionSeries(samples, best?.candidate ?? null), [best, samples])
  const lossSeries = useMemo<LineChartSeries[]>(
    () => [
      {
        label: 'MSE',
        color: '#ff7fc7',
        points: lossHistory,
      },
    ],
    [lossHistory],
  )

  async function trainAgainstSamples(
    nextSamples: RegressionSample[],
  ) {
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken

    let candidates: RegressionCandidate[]

    try {
      candidates = listRegressionCandidates(complexity)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not generate data.')
      return
    }

    setRunning(true)
    setStatus(null)
    setBest(null)
    setLossHistory([])
    setProgress({ tried: 0, total: candidates.length * SEARCH_ROUNDS })

    let bestFit: { candidate: RegressionCandidate; loss: number } | null = null
    let displayedBest: { candidate: RegressionCandidate; loss: number } | null = null
    const nextLossHistory: Array<{ x: number; y: number | null }> = []
    const coarseSamples = buildCoarseSamples(nextSamples)
    const coarseLosses = new Map<string, number>()
    let tried = 0
    let shouldStop = false

    for (let roundIndex = 0; roundIndex < SEARCH_ROUNDS; roundIndex += 1) {
      const roundSamples = roundIndex === 0 ? coarseSamples : nextSamples
      const roundCandidates =
        roundIndex === 0
          ? candidates
          : [...candidates].sort(
              (left, right) =>
                (coarseLosses.get(left.formula) ?? Number.POSITIVE_INFINITY) -
                (coarseLosses.get(right.formula) ?? Number.POSITIVE_INFINITY),
            )
      let roundBest: { candidate: RegressionCandidate; loss: number } | null = null

      for (let index = 0; index < roundCandidates.length; index += 1) {
        const candidate = roundCandidates[index]
        const loss = scoreCandidate(candidate, roundSamples)

        if (roundIndex === 0) {
          coarseLosses.set(candidate.formula, loss)
        }

        if (!roundBest || loss < roundBest.loss) {
          roundBest = { candidate, loss }
        }

        if (roundIndex === SEARCH_ROUNDS - 1 && (!bestFit || loss < bestFit.loss)) {
          bestFit = { candidate, loss }
        }

        displayedBest = roundIndex === SEARCH_ROUNDS - 1 ? bestFit : roundBest

        tried += 1
        nextLossHistory.push({
          x: tried,
          y: displayedBest ? Math.max(displayedBest.loss, 1e-12) : null,
        })

        const isFinalRound = roundIndex === SEARCH_ROUNDS - 1
        if (
          index === roundCandidates.length - 1 ||
          index % 2 === 1 ||
          (isFinalRound && bestFit && bestFit.loss < EXACT_RECOVERY_THRESHOLD)
        ) {
          if (runTokenRef.current !== runToken) {
            return
          }

          setBest(displayedBest)
          setLossHistory([...nextLossHistory])
          setProgress({ tried, total: candidates.length * SEARCH_ROUNDS })
          await new Promise((resolve) => window.setTimeout(resolve, 40))
        }

        if (isFinalRound && bestFit && bestFit.loss < EXACT_RECOVERY_THRESHOLD) {
          shouldStop = true
          break
        }
      }

      if (shouldStop) {
        break
      }
    }

    if (runTokenRef.current !== runToken) {
      return
    }

    setRunning(false)
    if (bestFit) {
      setStatus(null)
    } else {
      setStatus('No match.')
    }
  }

  async function handleLoadRandomNoiseyData() {
    const nextDataset = createSimulatedRegressionDataset(complexity)
    setSimulatedDataset(nextDataset)
    await trainAgainstSamples(nextDataset.samples)
  }

  return (
    <section className="regression-panel panel-frame" data-testid="regression-panel">
      <div className="panel-head">
        <h2>Regression</h2>
      </div>

      <div className="regression-controls">
        <div className="regression-inputs">
          <label className="field regression-depth">
            <span>Complexity {complexity}</span>
            <input
              data-testid="regression-complexity"
              type="range"
              min="1"
              max={String(MAX_REGRESSION_COMPLEXITY)}
              step="1"
              value={complexity}
              aria-label={`Regression complexity ${complexity} distinct operators`}
              onChange={(event) => setComplexity(Number.parseInt(event.target.value, 10))}
            />
          </label>

          <div className="regression-actions">
            <button
              type="button"
              className="action-button action-button--accent regression-train"
              data-testid="regression-random-data"
              onClick={handleLoadRandomNoiseyData}
              disabled={running}
            >
              {running ? 'Training…' : 'Random Noisy Data'}
            </button>
          </div>
        </div>
      </div>

      {status ? <p className="status-line regression-status">{status}</p> : null}

      <div className="regression-summary">
        <div className="info-chip">
          {progress.tried}/{progress.total}
        </div>
        <div className="info-chip">
          loss {best ? best.loss.toExponential(2) : '—'}
        </div>
        <div className="info-chip">
          {samples.length} pts
        </div>
        <div className="info-chip" data-testid="regression-dataset-kind">
          src {datasetSummary}
        </div>
        {simulatedDataset ? <div className="info-chip">ops {simulatedDataset.complexity}</div> : null}
        {simulatedDataset ? (
          <div className="info-chip" data-testid="regression-noise">
            sigma {simulatedDataset.noiseSigma.toFixed(3)}
          </div>
        ) : null}
      </div>

      <div className="regression-grid">
        <div className="plot-card">
          <div className="plot-card__header">
            <h3>Loss</h3>
          </div>
          <LineChart datasets={lossSeries} />
        </div>

        <div className="plot-card">
          <div className="plot-card__header">
            <h3>Fit</h3>
          </div>
          <LineChart datasets={regressionPlot} />
        </div>
      </div>

      {best ? (
        <div className="regression-best">
          <div className="regression-best__meta">
            <div>
              <p className="panel-kicker">Best</p>
              <h3>{best.candidate.formula}</h3>
            </div>
            <button
              type="button"
              className="action-button"
              onClick={() => onAdoptFormula(best.candidate.formula)}
            >
              Use in explorer
            </button>
          </div>

          <ExpressionTreeCard
            id="regression-best"
            title={best.candidate.formula}
            formula={best.candidate.formula}
            accent="var(--card-cyan)"
            expr={best.candidate.eml}
            labels={buildLabels(best.candidate.eml)}
            mode="compact"
          />
        </div>
      ) : null}
    </section>
  )
}
