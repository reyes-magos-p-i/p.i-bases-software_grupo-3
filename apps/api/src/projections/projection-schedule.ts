// Projection times are stored as Costa Rica local time (TIMESTAMP without
// zone) in the "YYYY-MM-DDTHH:mm" format. Costa Rica has no daylight saving,
// so a fixed offset is enough to know the current local time.
const COSTA_RICA_UTC_OFFSET_MINUTES = -360;
const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;

export const MAX_SCHEDULE_DAYS = 31;

export interface ProjectionSlot {
  screeningDate: string;
  startTime: string;
  endTime: string;
}

const toMs = (local: string) => Date.parse(`${local}:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 16);

export function addMinutes(local: string, minutes: number): string {
  return fromMs(toMs(local) + minutes * MINUTE_MS);
}

export function costaRicaNow(now = Date.now()): string {
  return fromMs(now + COSTA_RICA_UTC_OFFSET_MINUTES * MINUTE_MS);
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Minutes between two times of day; an end time not after the start ends the next day. */
export function scheduledDurationMinutes(startTime: string, endTime: string): number {
  const difference = minutesOfDay(endTime) - minutesOfDay(startTime);
  return difference > 0 ? difference : difference + DAY_MINUTES;
}

export function scheduleDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const last = toMs(`${endDate}T00:00`);
  for (let day = toMs(`${startDate}T00:00`); day <= last; day += DAY_MINUTES * MINUTE_MS)
    days.push(fromMs(day).slice(0, 10));
  return days;
}

export function buildSlots(
  days: readonly string[],
  startTime: string,
  durationMinutes: number,
): ProjectionSlot[] {
  return days.map((screeningDate) => {
    const start = `${screeningDate}T${startTime}`;
    return {
      screeningDate,
      startTime: start,
      endTime: addMinutes(start, durationMinutes),
    };
  });
}

/** "2026-07-22T18:05" -> "22/07/2026 18:05" */
export function formatLocal(local: string): string {
  const [date, time] = local.split('T');
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year} ${time}`;
}
