const priceFormat = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 2,
})

/** 1 -> "MF-001" */
export function projectionCode(prefix: string, id: number) {
  return `${prefix}-${String(id).padStart(3, '0')}`
}

/** "2099-07-22T18:05" -> "22/07/2099" */
export function formatProjectionDate(local: string) {
  return local.slice(0, 10).split('-').reverse().join('/')
}

/** "2099-07-22T18:05" -> "6:05 pm" */
export function formatProjectionTime(local: string) {
  const [hours = 0, minutes = 0] = local.slice(11, 16).split(':').map(Number)
  const suffix = hours < 12 ? 'am' : 'pm'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/** 235 -> "3 horas 55 minutos" */
export function formatMinutes(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const parts = []
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`)
  if (minutes || !hours) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`)
  return parts.join(' ')
}

export function formatProjectionDuration(startTime: string, endTime: string) {
  return formatMinutes((Date.parse(`${endTime}:00Z`) - Date.parse(`${startTime}:00Z`)) / 60_000)
}

export function formatPrice(price: number | null) {
  return price === null ? 'Sin precio' : priceFormat.format(price)
}
