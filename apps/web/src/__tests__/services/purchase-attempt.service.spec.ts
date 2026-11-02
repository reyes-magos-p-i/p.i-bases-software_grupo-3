import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  savePurchaseAttempt,
  loadPurchaseAttempt,
  clearPurchaseAttempt,
  PurchaseAttemptStorageError,
} from '@/services/purchase-attempt.service'
import type { PendingPurchaseAttempt } from '@/types/purchase'
const attempt: PendingPurchaseAttempt = {
  version: 1,
  requestKey: 'b801323b-9057-460b-b6ab-a36aa4e9b7d2',
  buyer: { kind: 'guest', email: 'guest@example.com', confirmEmail: 'guest@example.com' },
  selection: { functionId: 4, seats: { GENERAL: [1], CHILD: [], SENIOR: [] } },
  quote: {
    version: 'a'.repeat(64),
    quantity: 1,
    total: 3000,
    lines: [],
    function: {
      id: 4,
      movieId: 2,
      title: 'Película',
      synopsis: '',
      posterImage: '',
      branchId: 1,
      branchName: 'Central',
      theaterId: 3,
      rows: 1,
      columns: 2,
      startsAt: '2099-01-01T20:00:00-06:00',
      endsAt: '2099-01-01T22:00:00-06:00',
      format: '2D',
      technology: 'STANDARD',
      isPremiere: false,
      status: 'ACTIVE',
      available: true,
      price: 3000,
    },
    seats: [
      {
        positionId: 1,
        rowNumber: 1,
        columnNumber: 1,
        theaterId: 3,
        type: 'normal',
        state: 'free',
        category: 'GENERAL',
      },
    ],
  },
}
beforeEach(() => sessionStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})
describe('Pending purchase storage', () => {
  it('saves a detached snapshot and restores only the same request until it is resolved', () => {
    expect(loadPurchaseAttempt()).toBeNull()
    const snapshot = savePurchaseAttempt(attempt)
    expect(snapshot).toEqual(attempt)
    expect(snapshot).not.toBe(attempt)
    snapshot.selection.seats.GENERAL = []
    expect(loadPurchaseAttempt()).toEqual(attempt)
    clearPurchaseAttempt('other-request')
    expect(loadPurchaseAttempt()).toEqual(attempt)
    clearPurchaseAttempt(attempt.requestKey)
    expect(loadPurchaseAttempt()).toBeNull()
  })
  it('supports account-bound attempts without storing authentication tokens', () => {
    const account = { ...attempt, buyer: { kind: 'client' as const, clientId: 8 } }
    savePurchaseAttempt(account)
    expect(loadPurchaseAttempt()).toEqual(account)
    expect(sessionStorage.getItem('cinetadel.pending-purchase')).not.toContain('accessToken')
  })
  it.each([
    { ...attempt, version: 2 },
    { ...attempt, requestKey: 'bad' },
    { ...attempt, buyer: null },
    { ...attempt, buyer: { kind: 'client', clientId: 0 } },
    { ...attempt, buyer: { kind: 'guest', email: 'bad', confirmEmail: 'bad' } },
    { ...attempt, quote: null },
    { ...attempt, quote: { ...attempt.quote, quantity: 2 } },
    { ...attempt, quote: { ...attempt.quote, function: { ...attempt.quote.function, rows: 0 } } },
    {
      ...attempt,
      quote: { ...attempt.quote, seats: [{ ...attempt.quote.seats[0], state: 'in-use' }] },
    },
    {
      ...attempt,
      quote: {
        ...attempt.quote,
        seats: [{ ...attempt.quote.seats[0], positionId: 3, columnNumber: 3 }],
      },
    },
    { ...attempt, selection: { functionId: 5, seats: attempt.selection.seats } },
    { ...attempt, selection: { functionId: 4, seats: { GENERAL: [2], CHILD: [], SENIOR: [] } } },
  ])('refuses malformed or inconsistent attempts: %j', (value) => {
    expect(() => savePurchaseAttempt(value as PendingPurchaseAttempt)).toThrow(
      PurchaseAttemptStorageError,
    )
    sessionStorage.setItem('cinetadel.pending-purchase', JSON.stringify(value))
    expect(() => loadPurchaseAttempt()).toThrow(PurchaseAttemptStorageError)
  })
  it('reports corrupted JSON and blocked storage before sending another payment', () => {
    sessionStorage.setItem('cinetadel.pending-purchase', '{')
    expect(() => loadPurchaseAttempt()).toThrow(PurchaseAttemptStorageError)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => loadPurchaseAttempt()).toThrow(PurchaseAttemptStorageError)
  })
  it('reports persistence failures, while a cleanup failure cannot invalidate a completed purchase', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota')
    })
    expect(() => savePurchaseAttempt(attempt)).toThrow(PurchaseAttemptStorageError)
    savePurchaseAttempt(attempt)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    expect(() => clearPurchaseAttempt(attempt.requestKey)).not.toThrow()
    expect(loadPurchaseAttempt()).toEqual(attempt)
  })
})
