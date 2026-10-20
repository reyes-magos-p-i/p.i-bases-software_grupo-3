import { describe, expect, it } from 'vitest'
import { addToTime, daysInRange, durationBetween, localNow } from '@/utils/projection-time'

describe('projection time helpers', () => {
  it('adds minutes wrapping past midnight', () => {
    expect(addToTime('18:05', 235)).toBe('22:00')
    expect(addToTime('21:00', 295)).toBe('01:55')
  })

  it('measures durations that end the next day', () => {
    expect(durationBetween('18:05', '21:00')).toBe(175)
    expect(durationBetween('21:00', '01:55')).toBe(295)
  })

  it('counts the days of an inclusive range', () => {
    expect(daysInRange('2099-07-21', '2099-07-21')).toBe(1)
    expect(daysInRange('2099-07-21', '2099-08-21')).toBe(32)
  })

  it('formats the browser local time', () => {
    expect(localNow(new Date(2099, 6, 2, 9, 5))).toBe('2099-07-02T09:05')
  })
})
