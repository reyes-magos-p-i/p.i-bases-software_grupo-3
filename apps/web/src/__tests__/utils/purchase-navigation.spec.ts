import { describe, expect, it } from 'vitest'
import { parsePurchaseId, purchaseLocation, purchaseLoginQuery } from '@/utils/purchase-navigation'

describe('Purchase navigation', () => {
  it('builds a private profile destination from a valid purchase identifier', () => {
    expect(parsePurchaseId('12')).toBe(12)
    expect(parsePurchaseId('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER)
    expect(purchaseLocation(12)).toEqual({
      path: '/account/profile',
      query: { section: 'purchases', purchaseId: '12' },
    })
  })
  it.each([
    undefined,
    null,
    [],
    ['12'],
    12,
    '0',
    '-1',
    '01',
    '1.5',
    '1e2',
    ' 12',
    '9007199254740992',
    '12345678901234567',
    'https://other.example',
  ])('rejects invalid query identifiers %j', (value) => {
    expect(parsePurchaseId(value)).toBeNull()
  })
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuses an invalid receipt identifier %s',
    (id) => {
      expect(() => purchaseLocation(id)).toThrow(RangeError)
    },
  )
  it('preserves only a validated purchase from its own profile section during login', () => {
    expect(
      purchaseLoginQuery({
        path: '/account/profile',
        query: { section: 'purchases', purchaseId: '12', redirect: 'https://other.example' },
      }),
    ).toEqual({ purchaseId: '12' })
    expect(purchaseLoginQuery({ path: '/account/profile' })).toEqual({})
    expect(
      purchaseLoginQuery({
        path: '/account/profile',
        query: { section: 'security', purchaseId: '12' },
      }),
    ).toEqual({})
    expect(
      purchaseLoginQuery({
        path: '/account/profile',
        query: { section: 'purchases', purchaseId: 'bad' },
      }),
    ).toEqual({})
    expect(
      purchaseLoginQuery({
        path: '/buy-tickets',
        query: { section: 'purchases', purchaseId: '12' },
      }),
    ).toEqual({})
  })
})
