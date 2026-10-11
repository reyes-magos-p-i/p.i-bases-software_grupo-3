import { describe, expect, it } from 'vitest'
import {
  formatMinutes,
  formatPrice,
  formatProjectionDate,
  formatProjectionDuration,
  formatProjectionTime,
  projectionCode,
} from '@/utils/projection-format'

describe('projection format helpers', () => {
  it('builds padded display codes', () => {
    expect(projectionCode('MF', 1)).toBe('MF-001')
    expect(projectionCode('MF', 1234)).toBe('MF-1234')
  })

  it('formats dates and 12-hour times', () => {
    expect(formatProjectionDate('2099-07-22T18:05')).toBe('22/07/2099')
    expect(formatProjectionTime('2099-07-22T18:05')).toBe('6:05 pm')
    expect(formatProjectionTime('2099-07-22T00:30')).toBe('12:30 am')
    expect(formatProjectionTime('2099-07-22T12:00')).toBe('12:00 pm')
  })

  it('describes durations in hours and minutes', () => {
    expect(formatMinutes(235)).toBe('3 horas 55 minutos')
    expect(formatMinutes(61)).toBe('1 hora 1 minuto')
    expect(formatMinutes(120)).toBe('2 horas')
    expect(formatMinutes(0)).toBe('0 minutos')
    expect(formatProjectionDuration('2099-07-21T21:00', '2099-07-22T01:55')).toBe(
      '4 horas 55 minutos',
    )
  })

  it('formats prices in colones', () => {
    expect(formatPrice(3500)).toMatch(/3\s?500/)
    expect(formatPrice(null)).toBe('Sin precio')
  })
})
