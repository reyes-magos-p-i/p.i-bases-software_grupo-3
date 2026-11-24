import { describe, expect, it } from 'vitest'
import {
  SALES_CHARTS,
  SALES_METRICS,
  SALES_NOTES,
  rankedSalesPoints,
  salesChartPoints,
  salesDate,
  salesPoints,
  salesValue,
} from '@/utils/sales-statistics-presentation'
import { salesGroup, salesStatistics } from '../helpers/sales-statistics'

describe('sales statistics presentation', () => {
  it('defines every view and measure once', () => {
    expect(new Set(SALES_CHARTS.map((chart) => chart.key)).size).toBe(9)
    expect(SALES_METRICS.map((metric) => metric.value)).toEqual(['revenue', 'tickets', 'purchases'])
    expect(SALES_NOTES.categories[0]).toContain('cada categoría')
  })
  it('preserves dates, Spanish labels and currency formatting', () => {
    expect(salesDate('2026-11-23')).toBe('23/11/2026')
    expect(salesValue(12000.5, 'revenue')).toContain('₡')
    expect(salesValue(12, 'tickets')).toBe('12')
    expect(salesValue(2, 'purchases')).toBe('2')
    expect(salesPoints([salesGroup('acción')], 'tickets')).toEqual([
      { key: 'acción', label: 'Acción', value: 2 },
    ])
  })
  it('ranks at most ten by the chosen measure with numeric ties for ages', () => {
    const groups = Array.from({ length: 12 }, (_, index) =>
      salesGroup(String(index), index * 1000, 12 - index),
    )
    expect(rankedSalesPoints(groups, 'revenue')).toHaveLength(10)
    expect(rankedSalesPoints(groups, 'revenue')[0]!.key).toBe('11')
    expect(rankedSalesPoints(groups, 'tickets')[0]!.key).toBe('0')
    expect(
      rankedSalesPoints([salesGroup('10'), salesGroup('2')], 'purchases', true).map(
        (point) => point.key,
      ),
    ).toEqual(['2', '10'])
    expect(
      rankedSalesPoints([salesGroup('B'), salesGroup('A')], 'purchases').map((point) => point.key),
    ).toEqual(['A', 'B'])
  })
  it('keeps chronological series, complete province and gender groups, and ranking limits', () => {
    const data = salesStatistics()
    expect(salesChartPoints(data, 'series', 'tickets')[0]!.label).toBe('01/11/2026')
    data.rankings.provinces = [salesGroup('B'), salesGroup('A'), salesGroup('C', 9000)]
    expect(salesChartPoints(data, 'provinces', 'revenue').map((point) => point.key)).toEqual([
      'C',
      'A',
      'B',
    ])
    expect(salesChartPoints(data, 'genders', 'revenue').map((point) => point.label)).toEqual([
      'Mujer',
      'Sin información',
    ])
    expect(salesChartPoints(data, 'ages', 'revenue')).toHaveLength(2)
    expect(salesChartPoints(data, 'movies', 'revenue')).toHaveLength(2)
  })
})
