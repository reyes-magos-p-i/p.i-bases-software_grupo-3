import { describe, expect, it } from 'vitest'
import {
  TRANSACTION_STATUS_LABELS,
  formatColones,
  formatDate,
  formatDateTime,
  formatFunction,
  formatTransactionId,
} from '@/utils/transaction-format'

describe('transaction formats', () => {
  it.each([
    [123, 'FAC-000123'],
    [7, 'FAC-000007'],
    [1234567, 'FAC-1234567'],
  ])('formats invoice %i as %s', (id, expected) => {
    expect(formatTransactionId(id)).toBe(expected)
  })

  it('formats dates as dd/mm/yyyy and dd/mm/yyyy HH:mm', () => {
    expect(formatDate('2026-10-05T10:42')).toBe('05/10/2026')
    expect(formatDateTime('2026-10-12T17:00')).toBe('12/10/2026 17:00')
  })

  it.each([
    [7000, '₡7000'],
    [11500, '₡11500'],
    [0, '₡0'],
    [3500.5, '₡3500,50'],
  ])('formats %p colones as %s', (amount, expected) => {
    expect(formatColones(amount)).toBe(expected)
  })

  it('describes the function as the test plan writes it', () => {
    expect(
      formatFunction({
        movieTitle: 'Ecos del Volcán',
        theaterId: 1,
        functionStart: '2026-10-12T17:00',
      }),
    ).toBe('Ecos del Volcán – Sala 1, 12/10/2026 17:00')
  })

  it('names the statuses in Spanish', () => {
    expect(TRANSACTION_STATUS_LABELS).toEqual({ PAID: 'Pagada', CANCELLED: 'Cancelada' })
  })
})
