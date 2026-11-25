import { describe, expect, it } from 'vitest'
import {
  cartesianLayout,
  chartLabelIndexes,
  chartMaximum,
  chartRatio,
  donutSegments,
} from '@/utils/chart-geometry'

describe('chart geometry', () => {
  it('keeps a nonzero scale for empty and zero-valued charts', () => {
    expect(chartMaximum([])).toBe(1)
    expect(chartMaximum([0, 0])).toBe(1)
    expect(chartMaximum([3, 12, 9])).toBe(12)
    expect(chartRatio(0, 0)).toBe(0)
    expect(chartRatio(3, 12)).toBe(0.25)
  })
  it('maps values and ticks into the same plot bounds for the dashboard and PDF', () => {
    const layout = cartesianLayout([0, 5, 10], { left: 80, width: 400, top: 30, bottom: 250 })
    expect(layout.coordinates).toBe('80,250 280,140 480,30')
    expect(layout.ticks).toEqual([0, 2.5, 5, 7.5, 10])
    expect(layout.x(2)).toBe(480)
    expect(layout.y(10)).toBe(30)
    expect(cartesianLayout([0], { left: 80, width: 400, top: 30, bottom: 250 }).coordinates).toBe(
      '80,250',
    )
  })
  it('keeps the first and last temporal labels without overlapping all intermediate dates', () => {
    expect(chartLabelIndexes(31, 499)).toEqual([0, 15, 30])
    expect(chartLabelIndexes(1, 200)).toEqual([0])
    expect(chartLabelIndexes(0, 740)).toEqual([])
  })
  it('covers the donut exactly and handles an empty amount without invented shares', () => {
    expect(donutSegments([{ value: 25 }, { value: 75 }])).toEqual([
      { value: 25, size: 25, offset: 0 },
      { value: 75, size: 75, offset: 25 },
    ])
    expect(donutSegments([{ value: 0 }])).toEqual([{ value: 0, size: 0, offset: 0 }])
  })
})
