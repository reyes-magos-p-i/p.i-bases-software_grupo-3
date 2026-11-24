export function chartMaximum(values: readonly number[]): number {
  return values.reduce((maximum, value) => Math.max(maximum, value), 1)
}

export function chartRatio(value: number, maximum: number): number {
  return value / Math.max(1, maximum)
}

export function cartesianLayout(
  values: readonly number[],
  bounds: { left: number; width: number; top: number; bottom: number },
) {
  const maximum = chartMaximum(values)
  const x = (index: number) => bounds.left + (index * bounds.width) / Math.max(1, values.length - 1)
  const y = (value: number) =>
    bounds.bottom - chartRatio(value, maximum) * (bounds.bottom - bounds.top)
  return {
    x,
    y,
    coordinates: values.map((value, index) => `${x(index)},${y(value)}`).join(' '),
    ticks: Array.from({ length: 5 }, (_, index) => (maximum * index) / 4),
  }
}

export function chartLabelIndexes(length: number, width: number): number[] {
  const count = Math.min(length, Math.max(2, Math.floor(width / 140)))
  return Array.from({ length: count }, (_, index) =>
    Math.round((index * (length - 1)) / Math.max(1, count - 1)),
  )
}

export function donutSegments<T extends { value: number }>(points: readonly T[]) {
  const total = points.reduce((sum, point) => sum + point.value, 0)
  let offset = 0
  return points.map((point) => {
    const size = total ? (point.value / total) * 100 : 0
    const segment = { ...point, size, offset }
    offset += size
    return segment
  })
}
