import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateParts, hasMinimumAge, todayInCostaRica, validDate } from '@/utils/date-only'

afterEach(() => vi.useRealTimers())
describe('calendar dates', () => {
  it.each(['0001-01-01', '2000-02-29', '9999-12-31'])('accepts %s', (value) => {
    expect(validDate(value)).toBe(true)
  })
  it.each([
    '',
    '0000-01-01',
    '2026-02-29',
    '2026-04-31',
    '2026-1-01',
    '2026-13-01',
    '2026-01-01T00:00:00Z',
  ])('rejects %s', (value) => {
    expect(validDate(value)).toBe(false)
  })
  it('formats dates including years below 100 without a timezone shift', () => {
    expect(dateParts(1, 2, 3)).toBe('0001-02-03')
  })
  it('computes age on the Costa Rica calendar day', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-19T02:00:00Z'))
    expect(todayInCostaRica()).toBe('2026-10-18')
    expect(hasMinimumAge('2008-10-18', 18)).toBe(true)
    expect(hasMinimumAge('2008-10-19', 18)).toBe(false)
    expect(hasMinimumAge('2009-01-01', 18)).toBe(false)
    expect(hasMinimumAge('2007-12-31', 18)).toBe(true)
    expect(hasMinimumAge('2026-02-29', 18)).toBe(false)
  })
})
