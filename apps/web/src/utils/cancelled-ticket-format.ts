// Dates come from the API with the Costa Rica offset; the page always shows Costa Rica time.
const COSTA_RICA = 'America/Costa_Rica'

export function formatShowDate(value: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: COSTA_RICA,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function formatShowTime(value: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: COSTA_RICA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}

export function formatSeat(row: number, column: number): string {
  return `${row}-${column}`
}
