import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the explorer with the starting formula', () => {
    render(<App />)

    expect(screen.getByTestId('gallery-title')).toHaveTextContent('x + y')
    expect(screen.getByTestId('operation-card-imported')).toBeInTheDocument()
    expect(screen.getByTestId('paper-link')).toHaveAttribute('href', 'https://arxiv.org/abs/2603.21852')
    expect(screen.getByTestId('github-link')).toHaveAttribute('href', 'https://github.com/jpthor/eml-explorer')
  })

  it('collapses the featured explorer tree down to the full final formula', async () => {
    vi.useFakeTimers()

    const { container } = render(<App />)

    for (let step = 0; step < 10; step += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
    }

    const frameLabel = screen.getByTestId('collapse-frame-label-imported').textContent ?? ''
    const [currentFrame, totalFrames] = frameLabel.split('/').map((value) => Number(value.trim()))
    const nodes = container.querySelectorAll('.expression-card__node')
    const rootNode = nodes.item(0)
    const leftChildNode = nodes.item(1)
    const rightChildNode = nodes.item(2)

    expect(currentFrame).toBe(totalFrames)
    expect(rootNode).not.toHaveClass('is-hidden')
    expect(rootNode.querySelector('g.is-visible text')).toHaveTextContent('x + y')
    expect(leftChildNode).toHaveClass('is-hidden')
    expect(rightChildNode).toHaveClass('is-hidden')
  })

  it('loads a preset operation into the explorer from the top button bar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByTestId('preset-button-sub-xy'))

    expect(screen.getByTestId('import-input')).toHaveValue('x - y')
    expect(screen.getByTestId('gallery-title')).toHaveTextContent('x - y')
  })

  it('updates trees live from manual input and toggles between compact and expanded views', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByTestId('import-input')
    await user.clear(input)
    await user.type(input, 'sin(x)')

    await waitFor(() => {
      expect(screen.getByTestId('gallery-title')).toHaveTextContent('sin(x)')
    })

    await user.click(screen.getByTestId('mode-expanded'))

    expect(screen.getByTestId('mode-expanded')).toHaveClass('is-active')
    expect(screen.getByTestId('mode-compact')).not.toHaveClass('is-active')
  })

  it('evaluates constant formulas live', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByTestId('import-input')
    await user.clear(input)
    await user.type(input, '2 + 2')

    await waitFor(() => {
      expect(screen.getByText(/Evaluates to 4/)).toBeInTheDocument()
    })
  })

  it('accepts implicit multiplication in the live input', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByTestId('import-input')
    await user.clear(input)
    await user.type(input, '2x')

    await waitFor(() => {
      expect(screen.getByTestId('gallery-title')).toHaveTextContent('2x')
    })
    expect(screen.queryByText(/Implicit multiplication is not allowed/i)).not.toBeInTheDocument()
  })

  it('builds exp(x) manually from the builder tab', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByTestId('tab-builder'))
    await user.click(screen.getByTestId('builder-add-eml'))
    await user.click(screen.getByTestId('builder-add-x'))
    await user.click(screen.getByTestId('tree-node-R'))
    await user.click(screen.getByTestId('builder-add-one'))

    expect(screen.getByTestId('builder-simplified')).toHaveTextContent('exp(x)')
  })

  it('supports quick inserts from the builder tree toolbar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByTestId('tab-builder'))
    await user.click(screen.getByTestId('tree-quick-add-eml'))

    expect(screen.getByText(/Inserted eml with two fresh holes/)).toBeInTheDocument()
    expect(screen.getByText('Selected: L')).toBeInTheDocument()
    expect(screen.getByTestId('tree-node-root')).toHaveTextContent('eml')
  })

  it('auto-selects the new empty hole after wrap left and wrap right', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByTestId('tab-builder'))
    await user.click(screen.getByTestId('builder-add-eml'))
    await user.click(screen.getByTestId('tree-node-root'))
    await user.click(screen.getByText('Wrap left'))

    expect(screen.getByText('Selected: R')).toBeInTheDocument()

    await user.click(screen.getByText('Reset'))
    await user.click(screen.getByTestId('builder-add-eml'))
    await user.click(screen.getByTestId('tree-node-root'))
    await user.click(screen.getByText('Wrap right'))

    expect(screen.getByText('Selected: L')).toBeInTheDocument()
  })

  it('shows the simplified regression controls and runs the noisy-data demo', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByTestId('tab-regression'))
    expect(screen.queryByTestId('regression-target-input')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('regression-random-data'))

    await waitFor(() => {
      expect(screen.getByTestId('regression-dataset-kind')).not.toHaveTextContent('No data')
    })
    expect(screen.getByTestId('regression-noise')).toHaveTextContent('sigma')
  })
})
