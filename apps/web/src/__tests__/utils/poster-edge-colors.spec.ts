import { afterEach, describe, expect, it, vi } from 'vitest'
import { posterEdgeColors } from '@/utils/poster-edge-colors'

// SCRUM-438: the hero background takes the colors of the poster edges.
const WIDTH = 20
const HEIGHT = 30

/** A 20×30 poster whose pixels come from `paint(x, y)`. */
function stubCanvas(paint: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      data.set([...paint(x, y), 255], (y * WIDTH + x) * 4)
    }
  }
  const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data })) }
  stubContext(context)
  return context
}

function stubContext(context: unknown) {
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = create(tag)
    if (tag === 'canvas') {
      Object.defineProperty(element, 'getContext', { value: () => context })
    }
    return element
  })
}

describe('posterEdgeColors', () => {
  afterEach(() => vi.restoreAllMocks())

  it('averages each edge of the poster', () => {
    const context = stubCanvas((x, y) => {
      if (y < 2) return [100, 0, 0]
      if (y >= HEIGHT - 2) return [0, 0, 100]
      if (x < 2) return [0, 100, 0]
      if (x >= WIDTH - 2) return [40, 40, 40]
      return [255, 255, 255]
    })
    const image = new Image()

    const edges = posterEdgeColors(image)

    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, WIDTH, HEIGHT)
    expect(edges).toEqual({
      top: 'rgb(100 0 0)',
      bottom: 'rgb(0 0 100)',
      // The side strips include the corners of the top and bottom rows.
      left: 'rgb(7 87 7)',
      right: 'rgb(41 35 41)',
    })
  })

  it('dims bright edges so the light text keeps its contrast', () => {
    stubCanvas(() => [255, 204, 102])

    expect(posterEdgeColors(new Image())?.top).toBe('rgb(150 120 60)')
  })

  it('gives up when the browser cannot read the pixels', () => {
    stubContext(null)
    expect(posterEdgeColors(new Image())).toBeNull()

    vi.restoreAllMocks()
    stubContext({
      drawImage: vi.fn(),
      getImageData: () => {
        throw new DOMException('The canvas has been tainted', 'SecurityError')
      },
    })
    expect(posterEdgeColors(new Image())).toBeNull()
  })
})
