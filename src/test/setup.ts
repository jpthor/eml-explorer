import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
})

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: (function getContext(this: HTMLCanvasElement, contextId: string) {
    if (contextId !== '2d') {
      return null
    }

    const gradient = {
      addColorStop() {},
    }

    return {
      canvas: this,
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      bezierCurveTo() {},
      quadraticCurveTo() {},
      arc() {},
      rect() {},
      clip() {},
      fill() {},
      stroke() {},
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      setTransform() {},
      resetTransform() {},
      translate() {},
      rotate() {},
      scale() {},
      setLineDash() {},
      fillText() {},
      strokeText() {},
      measureText(text: string) {
        return {
          width: text.length * 8,
        }
      },
      createLinearGradient() {
        return gradient
      },
      createRadialGradient() {
        return gradient
      },
      drawImage() {},
      getImageData() {
        return {
          data: new Uint8ClampedArray(),
        }
      },
      putImageData() {},
    } as unknown as CanvasRenderingContext2D
  }) as HTMLCanvasElement['getContext'],
})

afterEach(() => {
  cleanup()
})
