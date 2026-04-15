import { Chart, type ChartDataset, registerables } from 'chart.js'
import { useEffect, useRef } from 'react'

Chart.register(...registerables)

export type LineChartSeries = {
  label: string
  color: string
  points: Array<{ x: number; y: number | null }>
  dashed?: boolean
}

type LineChartProps = {
  datasets: LineChartSeries[]
  yLabel?: string
  xLabel?: string
  className?: string
}

export function LineChart({ datasets, yLabel, xLabel, className }: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: datasets.map<ChartDataset<'line', { x: number; y: number | null }[]>>((dataset) => ({
          label: dataset.label,
          data: dataset.points,
          parsing: false,
          borderColor: dataset.color,
          backgroundColor: `${dataset.color}22`,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
          borderDash: dataset.dashed ? [8, 6] : undefined,
          tension: 0.16,
          spanGaps: false,
        })),
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        normalized: true,
        interaction: {
          mode: 'nearest',
          intersect: false,
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            labels: {
              color: '#d9d4ee',
              boxWidth: 10,
              boxHeight: 10,
              font: {
                family: 'IBM Plex Mono',
                size: 11,
              },
            },
          },
          tooltip: {
            enabled: true,
          },
        },
        scales: {
          x: {
            type: 'linear',
            title: xLabel
              ? {
                  display: true,
                  text: xLabel,
                  color: '#aba5c1',
                  font: {
                    family: 'IBM Plex Mono',
                    size: 11,
                  },
                }
              : undefined,
            ticks: {
              color: '#aba5c1',
              font: {
                family: 'IBM Plex Mono',
                size: 10,
              },
              maxTicksLimit: 8,
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.06)',
            },
            border: {
              color: 'rgba(255, 255, 255, 0.08)',
            },
          },
          y: {
            title: yLabel
              ? {
                  display: true,
                  text: yLabel,
                  color: '#aba5c1',
                  font: {
                    family: 'IBM Plex Mono',
                    size: 11,
                  },
                }
              : undefined,
            ticks: {
              color: '#aba5c1',
              font: {
                family: 'IBM Plex Mono',
                size: 10,
              },
              maxTicksLimit: 7,
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.06)',
            },
            border: {
              color: 'rgba(255, 255, 255, 0.08)',
            },
          },
        },
      },
    })

    return () => {
      chart.destroy()
    }
  }, [datasets, xLabel, yLabel])

  return (
    <div className={`line-chart ${className ?? ''}`.trim()}>
      <canvas ref={canvasRef} />
    </div>
  )
}
