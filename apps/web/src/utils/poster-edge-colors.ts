// SCRUM-438: colors of the four edges of a poster, for the hero background gradient.
// The poster is drawn small on a canvas and each edge strip is averaged. Bright colors are
// dimmed so the background stays dark behind the portal's light text.
export interface EdgeColors {
  top: string
  right: string
  bottom: string
  left: string
}

const WIDTH = 20
const HEIGHT = 30
const STRIP = 2
const MAX_CHANNEL = 150

type Pixel = [number, number, number]

function average(data: Uint8ClampedArray, inStrip: (x: number, y: number) => boolean): string {
  const sum: Pixel = [0, 0, 0]
  let count = 0
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (!inStrip(x, y)) continue
      const offset = (y * WIDTH + x) * 4
      sum[0] += data[offset]!
      sum[1] += data[offset + 1]!
      sum[2] += data[offset + 2]!
      count++
    }
  }
  const peak = Math.max(...sum) / count
  const scale = peak > MAX_CHANNEL ? MAX_CHANNEL / peak : 1
  const [red, green, blue] = sum.map((channel) => Math.round((channel / count) * scale))
  return `rgb(${red} ${green} ${blue})`
}

/** Edge colors of a loaded poster, or null when the browser cannot read its pixels. */
export function posterEdgeColors(image: HTMLImageElement): EdgeColors | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, WIDTH, HEIGHT)
    const { data } = context.getImageData(0, 0, WIDTH, HEIGHT)
    return {
      top: average(data, (_x, y) => y < STRIP),
      right: average(data, (x) => x >= WIDTH - STRIP),
      bottom: average(data, (_x, y) => y >= HEIGHT - STRIP),
      left: average(data, (x) => x < STRIP),
    }
  } catch {
    // A poster from another origin taints the canvas; the hero keeps its default colors.
    return null
  }
}
