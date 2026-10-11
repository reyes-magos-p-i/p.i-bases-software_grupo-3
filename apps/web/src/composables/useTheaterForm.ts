import { reactive } from 'vue'
import type {
  CreateTheaterRequest,
  Theater,
  TheaterCinema,
  TheaterProjector,
  TheaterStatus,
} from '@/types/theater'

export const MAX_SEATS = 5000
export const ALLOWED_PROJECTORS: readonly string[] = ['IMAX', '70mm']
export const ALLOWED_STATUSES: readonly TheaterStatus[] = ['Disponible', 'En función']

const isPositiveInt = (value: number) => Number.isInteger(value) && value >= 1

function seatsError(seats: number, rows: number, columns: number) {
  if (!isPositiveInt(seats) || seats > MAX_SEATS)
    return `Introduce un número entero entre 1 y ${MAX_SEATS}.`
  if (isPositiveInt(rows) && isPositiveInt(columns) && seats !== rows * columns)
    return 'El número de asientos debe ser igual a Filas por Columnas.'
}

const emptyDraft = () => ({
  numberOfSeats: '',
  dimensionX: '',
  dimensionY: '',
  projectorName: '',
  cinema: '',
  status: 'Disponible' as TheaterStatus,
})

export function useTheaterForm() {
  const draft = reactive(emptyDraft())
  const errors = reactive<Record<string, string>>({})

  function clearErrors() {
    for (const key of Object.keys(errors)) delete errors[key]
  }

  function reset() {
    Object.assign(draft, emptyDraft())
    clearErrors()
  }

  function fill(theater: Theater) {
    Object.assign(draft, {
      numberOfSeats: String(theater.numberOfSeats),
      dimensionX: String(theater.dimensionX),
      dimensionY: String(theater.dimensionY),
      projectorName: theater.projectorName,
      cinema: theater.cinema,
      status: theater.status,
    })
    clearErrors()
  }

  function validate(projectors: readonly TheaterProjector[], cinemas: readonly TheaterCinema[]) {
    clearErrors()
    const seats = Number(draft.numberOfSeats)
    const rows = Number(draft.dimensionX)
    const columns = Number(draft.dimensionY)

    const seatsMessage = seatsError(seats, rows, columns)
    if (seatsMessage) errors.numberOfSeats = seatsMessage
    if (!isPositiveInt(rows)) errors.dimensionX = 'Introduce una dimensión válida.'
    if (!isPositiveInt(columns)) errors.dimensionY = 'Introduce una dimensión válida.'
    if (
      !ALLOWED_PROJECTORS.includes(draft.projectorName) ||
      !projectors.some((item) => item.name === draft.projectorName)
    )
      errors.projectorName = 'Selecciona un proyector válido.'
    if (!cinemas.some((item) => item.name === draft.cinema))
      errors.cinema = 'Selecciona una sucursal.'
    if (!ALLOWED_STATUSES.includes(draft.status)) errors.status = 'Selecciona un estado válido.'
    return Object.keys(errors).length === 0
  }

  function toRequest(): CreateTheaterRequest {
    return {
      numberOfSeats: Number(draft.numberOfSeats),
      dimensionX: Number(draft.dimensionX),
      dimensionY: Number(draft.dimensionY),
      projectorName: draft.projectorName,
      cinema: draft.cinema,
      status: draft.status,
    }
  }

  return { draft, errors, reset, fill, validate, toRequest }
}
