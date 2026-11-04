import { describe, expect, it } from 'vitest'
import { registeredSeatMap, validSeatDimensions } from '@/utils/seat-layout'
import type { Seat } from '@/types/seats'

const layout = { theaterId: 7, rows: 2, columns: 3 }
const seat: Seat = { theaterId: 7, rowNumber: 1, columnNumber: 1, type: 'normal', state: 'free' }

describe('Registered seat layout', () => {
  it.each([
    [0, 3],
    [-1, 3],
    [1.5, 3],
    [2, 0],
    [2, -1],
    [2, 1.5],
    [101, 100],
    [Infinity, 2],
  ])('rejects unsupported dimensions %s by %s', (rows, columns) => {
    expect(validSeatDimensions(rows!, columns!)).toBe(false)
    expect(registeredSeatMap({ ...layout, rows: rows!, columns: columns! }, [seat]).size).toBe(0)
  })
  it('keeps only physical positions in the layout and never creates missing seats', () => {
    const records = [
      seat,
      { ...seat, columnNumber: 3 },
      { ...seat, theaterId: 8 },
      { ...seat, rowNumber: 0 },
      { ...seat, rowNumber: 3 },
      { ...seat, rowNumber: 1.5 },
      { ...seat, columnNumber: 0 },
      { ...seat, columnNumber: 4 },
      { ...seat, columnNumber: 1.5 },
    ]
    const map = registeredSeatMap(layout, records)
    expect([...map.keys()]).toEqual(['7:1:1', '7:1:3'])
    expect(map.has('7:1:2')).toBe(false)
    expect(records).toHaveLength(9)
  })
  it('counts a position once and preserves the last recorded state', () => {
    const map = registeredSeatMap(layout, [seat, { ...seat, state: 'in-use' }])
    expect(map.size).toBe(1)
    expect(map.get('7:1:1')?.state).toBe('in-use')
    expect(validSeatDimensions(100, 100)).toBe(true)
  })
})
