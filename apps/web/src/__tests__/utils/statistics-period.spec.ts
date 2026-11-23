import { describe, expect, it } from 'vitest'
import {
  statisticsAgeError,
  statisticsPeriod,
  statisticsPeriodError,
  statisticsPeriodCaption,
} from '@/utils/statistics-period'

describe('statistics periods and age ranges', () => {
  it.each([
    ['today', '2026-11-21'],
    ['last7days', '2026-11-15'],
    ['last30days', '2026-10-23'],
    ['thisMonth', '2026-11-01'],
    ['last12months', '2025-12-01'],
    ['thisYear', '2026-01-01'],
  ] as const)('resolves %s as an inclusive period starting on %s', (preset, expected) => {
    expect(statisticsPeriod(preset, '2026-11-21')).toEqual({
      dateFrom: expected,
      dateTo: '2026-11-21',
    })
  })
  it.each([
    ['today', 'de hoy'],
    ['last7days', 'de los últimos 7 días'],
    ['last30days', 'de los últimos 30 días'],
    ['thisMonth', 'de este mes'],
    ['last12months', 'de los últimos 12 meses'],
    ['thisYear', 'de este año'],
  ] as const)('describes %s in chart titles', (preset, expected) => {
    const period = statisticsPeriod(preset, '2026-11-22')
    expect(statisticsPeriodCaption(period.dateFrom, period.dateTo, '2026-11-22')).toBe(expected)
  })
  it('describes historical custom ranges and individual days without calling them recent', () => {
    expect(statisticsPeriodCaption('2026-10-01', '2026-10-31', '2026-11-22')).toBe(
      'del 01/10/2026 al 31/10/2026',
    )
    expect(statisticsPeriodCaption('2026-10-01', '2026-10-01', '2026-11-22')).toBe('del 01/10/2026')
    expect(statisticsPeriodCaption('2026-09-01', '2026-11-22', '2026-11-22')).toBe(
      'del 01/09/2026 al 22/11/2026',
    )
  })
  it('handles leap days and year changes without local timezone arithmetic', () => {
    expect(statisticsPeriod('last7days', '2024-03-01').dateFrom).toBe('2024-02-24')
    expect(statisticsPeriod('last30days', '2026-01-02').dateFrom).toBe('2025-12-04')
    expect(statisticsPeriod('today').dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
  })
  it.each([
    ['', '2026-11-21'],
    ['2026-11-21', ''],
    ['2026-02-30', '2026-11-21'],
    ['2026-11-21', 'bad'],
    ['2026-11-21', '2026-11-01'],
  ])('rejects the invalid date range %s to %s', (from, to) => {
    expect(statisticsPeriodError(from, to)).not.toBe('')
  })
  it('accepts a single day and inclusive custom ages starting at zero', () => {
    expect(statisticsPeriodError('2026-11-21', '2026-11-21')).toBe('')
    expect(statisticsAgeError('0', '17')).toBe('')
    expect(statisticsAgeError('25', '25')).toBe('')
  })
  it.each([
    ['', '17'],
    ['18', ''],
    ['-1', '17'],
    ['18.5', '25'],
    ['abc', '25'],
    ['25', '18'],
    ['0', '10000'],
  ])('rejects invalid ages %s to %s', (from, to) => {
    expect(statisticsAgeError(from, to)).not.toBe('')
  })
})
