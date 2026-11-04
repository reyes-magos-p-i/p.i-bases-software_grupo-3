import { seatKey, type Seat } from '@/types/seats'

export function validSeatDimensions(rows: number, columns: number): boolean {
  return (
    Number.isSafeInteger(rows) &&
    rows > 0 &&
    Number.isSafeInteger(columns) &&
    columns > 0 &&
    rows * columns <= 10_000
  )
}

export function registeredSeatMap<T extends Seat>(
  layout: { theaterId: number; rows: number; columns: number },
  seats: readonly T[],
): Map<string, T> {
  const result = new Map<string, T>()
  if (!validSeatDimensions(layout.rows, layout.columns)) return result
  for (const seat of seats) {
    if (
      seat.theaterId === layout.theaterId &&
      Number.isInteger(seat.rowNumber) &&
      Number.isInteger(seat.columnNumber) &&
      seat.rowNumber >= 1 &&
      seat.rowNumber <= layout.rows &&
      seat.columnNumber >= 1 &&
      seat.columnNumber <= layout.columns
    ) {
      result.set(seatKey(seat), seat)
    }
  }
  return result
}
