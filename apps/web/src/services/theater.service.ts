import { getApi } from '@/services/api'
import type {
  CreateTheaterRequest,
  Theater,
  TheaterCinema,
  TheaterProjector,
  TheaterStatusOption,
  UpdateTheaterRequest,
} from '@/types/theater'
import type { Seat, UpdateSeatStatusRequest, SeatType, SeatState } from '@/types/seats'

export async function getTheaters(signal?: AbortSignal): Promise<Theater[]> {
  const response = await getApi().get<Theater[]>('/theaters', { signal, timeout: 10000 })
  return response.data
}

export async function getTheaterCreationOptions(signal?: AbortSignal) {
  const [projectors, cinemas, statuses] = await Promise.all([
    getApi().get<TheaterProjector[]>('/projectors', { signal, timeout: 10000 }),
    getApi().get<TheaterCinema[]>('/cinemas', { signal, timeout: 10000 }),
    getApi().get<TheaterStatusOption[]>('/theaters/statuses', { signal, timeout: 10000 }),
  ])
  return { projectors: projectors.data, cinemas: cinemas.data, statuses: statuses.data }
}

export async function createTheater(data: CreateTheaterRequest): Promise<Theater> {
  const response = await getApi().post<Theater>('/theaters', data, { timeout: 30000 })
  return response.data
}

export async function updateTheater(id: number, data: UpdateTheaterRequest): Promise<Theater> {
  const response = await getApi().patch<Theater>(`/theaters/${id}`, data, { timeout: 30000 })
  return response.data
}

export async function deleteTheater(id: number): Promise<void> {
  await getApi().delete(`/theaters/${id}`, { timeout: 30000 })
}

type DbSeatState = 'libre' | 'indisponible' | 'ocupado' | 'reservado'
type DbSeatType = 'normal' | 'vip' | 'accesibilidad'

interface DbSeat extends Omit<Seat, 'state' | 'type'> {
  state: DbSeatState | SeatState
  type: DbSeatType | SeatType
}

const seatStateFromDb: Record<DbSeatState | SeatState, SeatState> = {
  libre: 'free',
  indisponible: 'unavailable',
  ocupado: 'in-use',
  reservado: 'reserved',
  free: 'free',
  unavailable: 'unavailable',
  'in-use': 'in-use',
  reserved: 'reserved',
}

const seatTypeFromDb: Record<DbSeatType | SeatType, SeatType> = {
  normal: 'normal',
  vip: 'vip',
  accesibilidad: 'accessibility',
  accessibility: 'accessibility',
}

const seatStateToDb: Record<SeatState, DbSeatState> = {
  free: 'libre',
  unavailable: 'indisponible',
  'in-use': 'ocupado',
  reserved: 'reservado',
}

const seatTypeToDb: Record<SeatType, DbSeatType> = {
  normal: 'normal',
  vip: 'vip',
  accessibility: 'accesibilidad',
}

function normalizeSeat(seat: DbSeat): Seat {
  const state = seatStateFromDb[seat.state]
  const type = seatTypeFromDb[seat.type]

  if (!state || !type) {
    throw new Error(`Unknown seat state or type: ${seat.state}, ${seat.type}`)
  }

  return {
    ...seat,
    state,
    type,
  }
}

export async function getTheaterSeats(theaterId: number, signal?: AbortSignal): Promise<Seat[]> {
  const response = await getApi().get<DbSeat[]>(`/theaters/${theaterId}/seats`, {
    signal,
    timeout: 10000,
  })

  return response.data.map(normalizeSeat)
}

export async function updateSeatStatuses(
  theaterId: number,
  data: UpdateSeatStatusRequest,
): Promise<void> {
  if (data.seats.length === 0) {
    throw new Error('Seleccione al menos un asiento.')
  }

  if (data.state === undefined && data.type === undefined) {
    throw new Error('Seleccione un estado o tipo.')
  }

  await getApi().patch(
    `/theaters/${theaterId}/seats`,
    {
      seats: data.seats,
      ...(data.state !== undefined ? { state: seatStateToDb[data.state] } : {}),
      ...(data.type !== undefined ? { type: seatTypeToDb[data.type] } : {}),
    },
    { timeout: 30000 },
  )
}
