export function validDate(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function todayInCostaRica(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts()
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function hasMinimumAge(value: string, minimum: number): boolean {
  if (!validDate(value)) return false
  const today = todayInCostaRica()
  const age = Number(today.slice(0, 4)) - Number(value.slice(0, 4))
  return age > minimum || (age === minimum && value.slice(5) <= today.slice(5))
}

export function dateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
