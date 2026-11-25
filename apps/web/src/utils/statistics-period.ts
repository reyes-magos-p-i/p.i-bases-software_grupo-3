import { todayInCostaRica, validDate } from '@/utils/date-only'

export type StatisticsPeriod =
  'today' | 'last7days' | 'last30days' | 'thisMonth' | 'last12months' | 'thisYear' | 'custom'
export const STATISTICS_PERIODS: { value: StatisticsPeriod; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'last7days', label: 'Últimos 7 días' },
  { value: 'last30days', label: 'Últimos 30 días' },
  { value: 'thisMonth', label: 'Mes actual' },
  { value: 'last12months', label: 'Últimos 12 meses' },
  { value: 'thisYear', label: 'Año actual' },
  { value: 'custom', label: 'Personalizado' },
]

export function statisticsPeriod(
  period: Exclude<StatisticsPeriod, 'custom'>,
  today = todayInCostaRica(),
) {
  const start = new Date(today + 'T00:00:00Z')
  if (period === 'last7days') start.setUTCDate(start.getUTCDate() - 6)
  if (period === 'last30days') start.setUTCDate(start.getUTCDate() - 29)
  if (period === 'thisMonth' || period === 'last12months' || period === 'thisYear')
    start.setUTCDate(1)
  if (period === 'last12months') start.setUTCMonth(start.getUTCMonth() - 11)
  if (period === 'thisYear') start.setUTCMonth(0)
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: today }
}

export function statisticsPeriodError(
  from: string,
  to: string,
  today = todayInCostaRica(),
): string {
  if (!from || !to) return 'Selecciona la fecha de inicio y la fecha de fin.'
  if (!validDate(from) || !validDate(to)) return 'Selecciona fechas válidas.'
  if (from > today || to > today) return 'Las fechas del periodo no pueden ser posteriores a hoy.'
  return from > to ? 'La fecha de inicio no puede ser posterior a la fecha de fin.' : ''
}

export function statisticsAgeError(from: string, to: string): string {
  if (!from || !to) return 'Completa la edad inicial y la edad final.'
  if (![from, to].every((value) => /^\d+$/u.test(value) && Number(value) <= 9999))
    return 'Ingresa edades válidas en años completos, sin números negativos.'
  return Number(from) > Number(to) ? 'La edad inicial no puede ser mayor que la edad final.' : ''
}

export function statisticsPeriodCaption(
  dateFrom: string,
  dateTo: string,
  today = todayInCostaRica(),
): string {
  const captions: Record<Exclude<StatisticsPeriod, 'custom'>, string> = {
    today: 'de hoy',
    last7days: 'de los últimos 7 días',
    last30days: 'de los últimos 30 días',
    thisMonth: 'de este mes',
    last12months: 'de los últimos 12 meses',
    thisYear: 'de este año',
  }
  if (dateTo === today) {
    for (const [preset, caption] of Object.entries(captions)) {
      if (
        statisticsPeriod(preset as Exclude<StatisticsPeriod, 'custom'>, today).dateFrom === dateFrom
      )
        return caption
    }
  }
  const from = dateFrom.split('-').reverse().join('/')
  const to = dateTo.split('-').reverse().join('/')
  return dateFrom === dateTo ? `del ${from}` : `del ${from} al ${to}`
}
