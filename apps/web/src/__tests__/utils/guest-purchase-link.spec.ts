import { describe, expect, it } from 'vitest'
import { guestPurchaseLink, readGuestPurchaseLink } from '@/utils/guest-purchase-link'

const code = '12.4AVG75NWK52Z476W4QDMW7DYQE'

describe('Guest purchase links', () => {
  it('builds a direct receipt link with access only in its fragment', () => {
    const url = new URL(guestPurchaseLink(code.toLowerCase(), 'https://cinema.example/'))
    expect(url.origin).toBe('https://cinema.example')
    expect(url.pathname).toBe('/guest-purchases/receipt')
    expect(url.search).toBe('')
    expect(url.hash).toBe('#' + code)
    expect(readGuestPurchaseLink(url.hash)).toBe(code)
  })
  it('uses the current frontend origin when copying a link from checkout', () => {
    expect(new URL(guestPurchaseLink(code)).origin).toBe(window.location.origin)
  })
  it('preserves access for credentials issued before private links', () => {
    const legacy = 'INV-12-' + 'A'.repeat(64)
    expect(readGuestPurchaseLink(new URL(guestPurchaseLink(legacy)).hash)).toBe(legacy)
    expect(readGuestPurchaseLink('#12%2E4avg75nwk52z476w4qdmw7dyqe')).toBe(code)
  })
  it.each(['', 'ORD-000012', 'javascript:alert(1)', '12.' + 'A'.repeat(26)])(
    'does not create a link from an invalid credential: %s',
    (value) => {
      expect(() => guestPurchaseLink(value)).toThrow(TypeError)
    },
  )
  it.each(['', code, '#', '#ORD-000012', '#%ZZ', '#' + 'A'.repeat(256), '#' + code + '&other=1'])(
    'rejects an incomplete or malformed link fragment: %s',
    (hash) => {
      expect(readGuestPurchaseLink(hash)).toBeNull()
    },
  )
})
