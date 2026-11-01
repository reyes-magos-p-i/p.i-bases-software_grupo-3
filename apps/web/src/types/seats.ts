export type SeatType = 'normal' | 'vip' | 'accessibility'

export type SeatState = 'free' | 'unavailable' | 'in-use' | 'reserved'

export type SeatSelectionLimit = number | 'all'

export interface Seat {
  theaterId: number
  rowNumber: number
  columnNumber: number
  type: SeatType
  state: SeatState
}

// Include the theater because row and column alone are not globally unique.
export function seatKey(seat: Pick<Seat, 'theaterId' | 'rowNumber' | 'columnNumber'>): string {
  return `${seat.theaterId}:${seat.rowNumber}:${seat.columnNumber}`
}

export const seatTypeLabels: Record<SeatType, string> = {
  normal: 'Normal',
  vip: 'VIP',
  accessibility: 'Accesibilidad',
}

export const seatStateLabels: Record<SeatState, string> = {
  free: 'Libre',
  unavailable: 'No disponible',
  'in-use': 'En uso',
  reserved: 'Reservado',
}
