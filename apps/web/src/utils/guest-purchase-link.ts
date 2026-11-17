import { normalizeGuestPurchaseCode, validGuestPurchaseCode } from './guest-purchase-code'

export function guestPurchaseLink(accessCode: string, origin = window.location.origin): string {
  if (!validGuestPurchaseCode(accessCode)) throw new TypeError('Invalid guest purchase access.')
  const url = new URL('/guest-purchases/receipt', origin)
  url.hash = normalizeGuestPurchaseCode(accessCode)
  return url.toString()
}

export function readGuestPurchaseLink(hash: string): string | null {
  if (!hash.startsWith('#') || hash.length > 256) return null
  try {
    const code = normalizeGuestPurchaseCode(decodeURIComponent(hash.slice(1)))
    return validGuestPurchaseCode(code) ? code : null
  } catch {
    return null
  }
}
