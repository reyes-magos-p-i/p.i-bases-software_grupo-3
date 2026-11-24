// SCRUM-437: texts of the portal cards, as in the prototype ("2 h 8 min", "20 nov").
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function formatRunningTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** "2026-11-20" to "20 nov"; empty when the value is not a YYYY-MM-DD date. */
export function formatShortDate(value: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined
  return match && month ? `${Number(match[3])} ${month}` : ''
}
