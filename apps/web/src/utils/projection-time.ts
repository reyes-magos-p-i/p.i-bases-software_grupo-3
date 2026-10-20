const DAY_MINUTES = 1440
const pad = (value: number) => String(value).padStart(2, '0')

function toMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** "21:00" + 295 -> "01:55" */
export function addToTime(time: string, minutes: number) {
  const total = (((toMinutes(time) + minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** Minutes from start to end; an end not after the start belongs to the next day. */
export function durationBetween(startTime: string, endTime: string) {
  const difference = toMinutes(endTime) - toMinutes(startTime)
  return difference > 0 ? difference : difference + DAY_MINUTES
}

/** Days in an inclusive "YYYY-MM-DD" range. */
export function daysInRange(startDate: string, endDate: string) {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1
}

/** Browser local time as "YYYY-MM-DDTHH:mm". */
export function localNow(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}
