import type {
  CinemaOption,
  CreatePromotionPayload,
  PromotionErrors,
  PromotionForm,
} from '@/types/promotion'

export const PROMOTION_TITLE_LIMIT = 150
export const PROMOTION_TEXT_LIMIT = 4000
export const PROMOTION_POSTER_PATH_LIMIT = 500
export const MAX_POSTER_SIZE = 5 * 1024 * 1024

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function parseAmount(value: string): number | null {
  // Accept a comma or a dot, with at most two decimal places. No exponent notation.
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function validateText(form: PromotionForm, errors: PromotionErrors) {
  if (!form.promotionTitle.trim()) errors.promotionTitle = 'Este campo es obligatorio.'
  else if (form.promotionTitle.length > PROMOTION_TITLE_LIMIT)
    errors.promotionTitle = `El título no puede superar ${PROMOTION_TITLE_LIMIT} caracteres.`
  if (!form.description.trim()) errors.description = 'Este campo es obligatorio.'
  else if (form.description.length > PROMOTION_TEXT_LIMIT)
    errors.description = `La descripción no puede superar ${PROMOTION_TEXT_LIMIT} caracteres.`
  if (form.conditions.length > PROMOTION_TEXT_LIMIT)
    errors.conditions = `Las condiciones no pueden superar ${PROMOTION_TEXT_LIMIT} caracteres.`
}

function validateAmount(form: PromotionForm, errors: PromotionErrors) {
  if (!['percentage', 'fixed'].includes(form.promotionType))
    errors.promotionType = 'Selecciona el tipo de promoción.'

  const amount = parseAmount(form.amount)
  const max = form.promotionType === 'percentage' ? 100 : 4000
  if (amount === null || amount < 0.01 || amount > max)
    errors.amount = `Ingresa un monto entre 0,01 y ${max}, con máximo dos decimales.`
}

function validateSchedule(form: PromotionForm, errors: PromotionErrors) {
  if (!isValidDate(form.beginDate)) errors.beginDate = 'Selecciona una fecha válida.'
  if (!isValidDate(form.endDate)) errors.endDate = 'Selecciona una fecha válida.'
  else if (!errors.beginDate && form.endDate < form.beginDate)
    errors.endDate = 'La fecha final no puede ser anterior a la fecha inicial.'

  if (!form.allDay) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.beginHour))
      errors.beginHour = 'Selecciona una hora inicial válida.'
    if (!/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(form.endHour))
      errors.endHour = 'Selecciona una hora final válida.'
    if (!errors.beginHour && !errors.endHour && form.endHour <= form.beginHour)
      errors.endHour = 'La hora final debe ser posterior a la inicial; no puede cruzar medianoche.'
  }
}

function validateTargets(
  form: PromotionForm,
  cinemas: readonly CinemaOption[],
  errors: PromotionErrors,
) {
  const ids = new Set(cinemas.map((cinema) => cinema.id))
  if (!form.branchIds.length) errors.branchIds = 'Selecciona al menos una sucursal.'
  else if (new Set(form.branchIds).size !== form.branchIds.length
    || form.branchIds.some((id) => !Number.isInteger(id) || id < 1 || !ids.has(id)))
    errors.branchIds = 'La selección contiene sucursales inválidas o repetidas.'
  if (new Set(form.weekdays).size !== form.weekdays.length
    || form.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    errors.weekdays = 'Selecciona días válidos y sin repetir.'
  if (form.projectionFormat && !['2D', '3D'].includes(form.projectionFormat))
    errors.projectionFormat = 'Selecciona un formato válido.'
  if (form.technology && !['STANDARD', 'IMAX', '70MM'].includes(form.technology))
    errors.technology = 'Selecciona una tecnología válida.'
  if (form.technology === '70MM' && form.projectionFormat === '3D')
    errors.technology = 'La tecnología 70MM no es compatible con 3D.'
}

function validatePoster(form: PromotionForm, poster: File | null, errors: PromotionErrors) {
  if (form.posterPath && form.posterPath.length > PROMOTION_POSTER_PATH_LIMIT)
    errors.poster = `La ruta del póster no puede superar ${PROMOTION_POSTER_PATH_LIMIT} caracteres.`
  if (poster) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(poster.type))
      errors.poster = 'Selecciona una imagen JPEG, PNG o WebP.'
    else if (poster.size > MAX_POSTER_SIZE)
      errors.poster = 'La imagen no puede superar 5 MB.'
  }
}

export function validatePromotion(
  form: PromotionForm,
  cinemas: readonly CinemaOption[],
  poster: File | null = null,
): PromotionErrors {
  const errors: PromotionErrors = {}
  validateText(form, errors)
  validateAmount(form, errors)
  validateSchedule(form, errors)
  validateTargets(form, cinemas, errors)
  validatePoster(form, poster, errors)
  return errors
}

export function buildPromotionPayload(form: PromotionForm): CreatePromotionPayload {
  const amount = parseAmount(form.amount)
  if (amount === null || !['percentage', 'fixed'].includes(form.promotionType))
    throw new Error('Validate the form before building the payload.')
  return {
    promotionType: form.promotionType as CreatePromotionPayload['promotionType'],
    promotionAmount: amount,
    beginDate: form.beginDate,
    endDate: form.endDate,
    beginHour: form.allDay ? null : form.beginHour,
    endHour: form.allDay ? null : form.endHour,
    projectionFormat: form.projectionFormat || null,
    technology: form.technology || null,
    promotionTitle: form.promotionTitle.trim(),
    description: form.description.trim(),
    conditions: form.conditions.trim() || null,
    posterPath: form.posterPath,
    weekdays: [...form.weekdays].sort((a, b) => a - b),
    branchIds: [...form.branchIds],
  }
}
