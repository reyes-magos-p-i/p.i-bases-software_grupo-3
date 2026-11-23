// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { CinemaOption, PromotionForm } from '@/types/promotion'
import {
  buildPromotionPayload,
  isValidDate,
  MAX_POSTER_SIZE,
  parseAmount,
  PROMOTION_POSTER_PATH_LIMIT,
  PROMOTION_TEXT_LIMIT,
  PROMOTION_TITLE_LIMIT,
  validatePromotion,
} from '@/utils/promotion-validation'

const cinemas: CinemaOption[] = [
  { id: 1, name: 'Central' },
  { id: 2, name: 'Norte' },
]
function form(overrides: Partial<PromotionForm> = {}): PromotionForm {
  return {
    promotionType: 'percentage', amount: '25',
    beginDate: '2026-11-17', endDate: '2026-12-31',
    allDay: true, beginHour: '', endHour: '',
    promotionTitle: 'Promoción de cine', description: 'Descuento en funciones elegibles.',
    conditions: '', posterPath: null, projectionFormat: '', technology: '',
    weekdays: [], branchIds: [1], ...overrides,
  }
}
function image(type: string, size = 1): File {
  return new File([new Uint8Array(size)], 'poster', { type })
}

describe('isValidDate', () => {
  it.each([
    '0001-01-01', '9999-12-31', '2026-11-17',
    '2028-02-29', '2000-02-29',
  ])('accepts %s', (value) => {
    expect(isValidDate(value)).toBe(true)
  })

  it.each([
    '', '0000-01-01', '10000-01-01', '2026-2-01', '17/11/2026',
    '2026-11-17T00:00:00Z', ' 2026-11-17', '2026-11-17 ',
    '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
    '2026-04-31', '2026-02-29', '2028-02-30', '1900-02-29',
  ])('rejects %s', (value) => {
    expect(isValidDate(value)).toBe(false)
  })
})

describe('parseAmount', () => {
  it.each([
    { input: '25', expected: 25 },
    { input: '25.5', expected: 25.5 },
    { input: '25.50', expected: 25.5 },
    { input: '25,50', expected: 25.5 },
    { input: ' 25,50 ', expected: 25.5 },
    { input: '0.01', expected: 0.01 },
    { input: '00025.50', expected: 25.5 },
    // Parsing is separate from the positive amount and maximum validation.
    { input: '0', expected: 0 },
    { input: '4000.01', expected: 4000.01 },
  ])('parses $input', ({ input, expected }) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each([
    '', ' ', '-1', '+1', '.50', '25.', '25,', '25.123', '25,123',
    '1e2', 'NaN', 'Infinity', '1 000', '1,000.00', '1.000,00',
    '25..50', '25,,50', 'a', '9'.repeat(400),
  ])('rejects %s', (value) => {
    expect(parseAmount(value)).toBeNull()
  })
})

describe('validatePromotion', () => {
  it('accepts the minimum required fields', () => {
    expect(validatePromotion(form(), cinemas)).toEqual({})
  })

  it('accepts all optional restrictions and a valid poster', () => {
    expect(validatePromotion(form({
      allDay: false, beginHour: '14:30', endHour: '18:00',
      projectionFormat: '2D', technology: 'IMAX', conditions: 'Condiciones.',
      posterPath: '/uploads/promotions/banner.webp', weekdays: [2, 4], branchIds: [1, 2],
    }), cinemas, image('image/webp'))).toEqual({})
  })

  it.each(['promotionTitle', 'description'] as const)(
    'requires nonblank %s', (field) => {
      for (const value of ['', '   ', '\n\t']) {
        expect(validatePromotion(form({ [field]: value }), cinemas)[field])
          .toBe('Este campo es obligatorio.')
      }
    },
  )

  it.each([
    { field: 'promotionTitle' as const, limit: PROMOTION_TITLE_LIMIT },
    { field: 'description' as const, limit: PROMOTION_TEXT_LIMIT },
    { field: 'conditions' as const, limit: PROMOTION_TEXT_LIMIT },
  ])('enforces the $field length boundary', ({ field, limit }) => {
    expect(validatePromotion(form({ [field]: 'a'.repeat(limit) }), cinemas)[field]).toBeUndefined()
    expect(validatePromotion(form({ [field]: 'a'.repeat(limit + 1) }), cinemas)[field]).toBeTruthy()
  })

  it('requires a supported promotion type', () => {
    expect(validatePromotion(form({ promotionType: '' }), cinemas).promotionType).toBeTruthy()
    expect(validatePromotion(form({ promotionType: 'other' as PromotionForm['promotionType'] }), cinemas)
      .promotionType).toBeTruthy()
  })

  it.each([
    { type: 'percentage' as const, amount: '0.01' },
    { type: 'percentage' as const, amount: '100' },
    { type: 'percentage' as const, amount: '99,99' },
    { type: 'fixed' as const, amount: '0.01' },
    { type: 'fixed' as const, amount: '4000' },
    { type: 'fixed' as const, amount: '3999.99' },
  ])('accepts $type amount $amount', ({ type, amount }) => {
    expect(validatePromotion(form({ promotionType: type, amount }), cinemas).amount).toBeUndefined()
  })

  it.each([
    { type: 'percentage' as const, amount: '100.01' },
    { type: 'fixed' as const, amount: '4000.01' },
    { type: 'percentage' as const, amount: '0' },
    { type: 'fixed' as const, amount: '0' },
    { type: 'percentage' as const, amount: '-1' },
    { type: 'fixed' as const, amount: '25.123' },
    { type: 'percentage' as const, amount: '' },
  ])('rejects $type amount $amount', ({ type, amount }) => {
    expect(validatePromotion(form({ promotionType: type, amount }), cinemas).amount).toBeTruthy()
  })

  it('validates each date independently', () => {
    const errors = validatePromotion(form({ beginDate: '2026-02-30', endDate: '' }), cinemas)
    expect(errors.beginDate).toBeTruthy()
    expect(errors.endDate).toBeTruthy()
  })

  it('rejects reversed dates', () => {
    expect(validatePromotion(form({ endDate: '2026-11-16' }), cinemas).endDate)
      .toBe('La fecha final no puede ser anterior a la fecha inicial.')
  })

  it('accepts a single-day promotion and past dates', () => {
    expect(validatePromotion(form({ beginDate: '2000-02-29', endDate: '2000-02-29' }), cinemas))
      .toEqual({})
  })

  it('ignores unused hour fields for all-day promotions', () => {
    expect(validatePromotion(form({ allDay: true, beginHour: 'invalid', endHour: 'invalid' }), cinemas))
      .toEqual({})
  })

  it.each([
    { beginHour: '00:00', endHour: '00:01' },
    { beginHour: '14:30', endHour: '18:00' },
    { beginHour: '23:59', endHour: '24:00' },
    { beginHour: '00:00', endHour: '24:00' },
  ])('accepts daily window $beginHour–$endHour', (hours) => {
    expect(validatePromotion(form({ allDay: false, ...hours }), cinemas)).toEqual({})
  })

  it.each(['', '24:00', '9:00', '12:60', '-1:00', '12:00:00'])(
    'rejects invalid beginHour %s', (beginHour) => {
      expect(validatePromotion(form({ allDay: false, beginHour, endHour: '24:00' }), cinemas)
        .beginHour).toBeTruthy()
    },
  )

  it.each(['', '24:01', '25:00', '9:00', '12:60', '18:00:00'])(
    'rejects invalid endHour %s', (endHour) => {
      expect(validatePromotion(form({ allDay: false, beginHour: '00:00', endHour }), cinemas)
        .endHour).toBeTruthy()
    },
  )

  it.each([
    { beginHour: '14:30', endHour: '14:30' },
    { beginHour: '18:00', endHour: '14:30' },
    { beginHour: '22:00', endHour: '02:00' },
  ])('rejects equal, reversed or overnight hours: $beginHour–$endHour', (hours) => {
    expect(validatePromotion(form({ allDay: false, ...hours }), cinemas).endHour).toBeTruthy()
  })

  it.each([
    { ids: [] }, { ids: [1, 1] }, { ids: [0] }, { ids: [-1] },
    { ids: [1.5] }, { ids: [3] }, { ids: [NaN] },
  ])('rejects invalid cinema selection $ids', ({ ids }) => {
    expect(validatePromotion(form({ branchIds: ids }), cinemas).branchIds).toBeTruthy()
  })

  it('rejects a selected cinema missing from the available catalog', () => {
    expect(validatePromotion(form(), []).branchIds).toBeTruthy()
  })

  it('accepts multiple available cinemas', () => {
    expect(validatePromotion(form({ branchIds: [2, 1] }), cinemas).branchIds).toBeUndefined()
  })

  it.each([
    { days: [] }, { days: [1] }, { days: [7] }, { days: [1, 2, 3, 4, 5, 6, 7] },
  ])('accepts weekdays $days', ({ days }) => {
    expect(validatePromotion(form({ weekdays: days }), cinemas).weekdays).toBeUndefined()
  })

  it.each([
    { days: [1, 1] }, { days: [0] }, { days: [8] }, { days: [1.5] }, { days: [NaN] },
  ])('rejects weekdays $days', ({ days }) => {
    expect(validatePromotion(form({ weekdays: days }), cinemas).weekdays).toBeTruthy()
  })

  it.each(['', '2D', '3D'] as const)('accepts format %s', (projectionFormat) => {
    expect(validatePromotion(form({ projectionFormat }), cinemas).projectionFormat).toBeUndefined()
  })

  it.each(['', 'STANDARD', 'IMAX', '70MM'] as const)('accepts technology %s', (technology) => {
    expect(validatePromotion(form({ technology }), cinemas).technology).toBeUndefined()
  })

  it('rejects unsupported format and technology values', () => {
    const errors = validatePromotion(form({
      projectionFormat: '4D' as PromotionForm['projectionFormat'],
      technology: 'standard' as PromotionForm['technology'],
    }), cinemas)
    expect(errors.projectionFormat).toBeTruthy()
    expect(errors.technology).toBeTruthy()
  })

  it('rejects 3D with 70MM but accepts 2D with 70MM', () => {
    expect(validatePromotion(form({ projectionFormat: '3D', technology: '70MM' }), cinemas)
      .technology).toBe('La tecnología 70MM no es compatible con 3D.')
    expect(validatePromotion(form({ projectionFormat: '2D', technology: '70MM' }), cinemas))
      .toEqual({})
  })

  it('enforces the poster path length', () => {
    expect(validatePromotion(form({ posterPath: 'a'.repeat(PROMOTION_POSTER_PATH_LIMIT) }), cinemas)
      .poster).toBeUndefined()
    expect(validatePromotion(form({ posterPath: 'a'.repeat(PROMOTION_POSTER_PATH_LIMIT + 1) }), cinemas)
      .poster).toBeTruthy()
  })

  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s images', (type) => {
    expect(validatePromotion(form(), cinemas, image(type)).poster).toBeUndefined()
  })

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', ''])(
    'rejects image type %s', (type) => {
      expect(validatePromotion(form(), cinemas, image(type)).poster)
        .toBe('Selecciona una imagen JPEG, PNG o WebP.')
    },
  )

  it('accepts exactly 5 MiB and rejects a file one byte larger', () => {
    expect(validatePromotion(form(), cinemas, image('image/png', MAX_POSTER_SIZE)).poster)
      .toBeUndefined()
    expect(validatePromotion(form(), cinemas, image('image/png', MAX_POSTER_SIZE + 1)).poster)
      .toBe('La imagen no puede superar 5 MB.')
  })

  it('returns multiple errors without mutating the form or catalog', () => {
    const input = form({ promotionTitle: '', description: '', amount: '0', branchIds: [] })
    const before = JSON.stringify(input)
    const catalogBefore = JSON.stringify(cinemas)
    const errors = validatePromotion(input, cinemas)
    expect(errors).toEqual(expect.objectContaining({
      promotionTitle: expect.any(String), description: expect.any(String),
      amount: expect.any(String), branchIds: expect.any(String),
    }))
    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.stringify(cinemas)).toBe(catalogBefore)
  })
})

describe('buildPromotionPayload', () => {
  it('trims text, parses decimal commas, and normalizes unrestricted fields', () => {
    const input = form({
      promotionTitle: '  Oferta  ', description: '  Descripción  ',
      conditions: '   ', amount: '25,50', beginHour: '09:00', endHour: '12:00',
    })
    expect(buildPromotionPayload(input)).toEqual({
      promotionType: 'percentage', promotionAmount: 25.5,
      beginDate: '2026-11-17', endDate: '2026-12-31',
      beginHour: null, endHour: null, projectionFormat: null, technology: null,
      promotionTitle: 'Oferta', description: 'Descripción', conditions: null,
      posterPath: null, weekdays: [], branchIds: [1],
    })
  })

  it('preserves explicit restrictions, dates, poster path and fixed amount', () => {
    const payload = buildPromotionPayload(form({
      promotionType: 'fixed', amount: '4000', allDay: false,
      beginHour: '22:00', endHour: '24:00', projectionFormat: '2D', technology: '70MM',
      conditions: '  Una por compra.  ', posterPath: '/uploads/promotions/banner.webp',
      weekdays: [4, 2], branchIds: [2, 1],
    }))
    expect(payload).toEqual(expect.objectContaining({
      promotionType: 'fixed', promotionAmount: 4000,
      beginHour: '22:00', endHour: '24:00', projectionFormat: '2D', technology: '70MM',
      conditions: 'Una por compra.', posterPath: '/uploads/promotions/banner.webp',
      weekdays: [2, 4], branchIds: [2, 1],
    }))
  })

  it('copies arrays and sorts weekdays without mutating the form', () => {
    const input = form({ weekdays: [7, 1, 4], branchIds: [2, 1] })
    const payload = buildPromotionPayload(input)
    expect(payload.weekdays).toEqual([1, 4, 7])
    expect(input.weekdays).toEqual([7, 1, 4])
    expect(payload.weekdays).not.toBe(input.weekdays)
    expect(payload.branchIds).not.toBe(input.branchIds)
    payload.weekdays.push(2)
    payload.branchIds.push(3)
    expect(input.weekdays).toEqual([7, 1, 4])
    expect(input.branchIds).toEqual([2, 1])
  })

  it.each(['', '-1', '25.123', 'not a number'])('throws for unparseable amount %s', (amount) => {
    expect(() => buildPromotionPayload(form({ amount })))
      .toThrow('Validate the form before building the payload.')
  })

  it('throws for an unselected promotion type', () => {
    expect(() => buildPromotionPayload(form({ promotionType: '' })))
      .toThrow('Validate the form before building the payload.')
  })
})
