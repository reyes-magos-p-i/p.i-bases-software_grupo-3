export function normalizeGuestPurchaseCode(code: string): string {
  const value = code.trim().toUpperCase()
  const separator = value.indexOf('.')
  if (separator < 0) return value
  const secret = value
    .slice(separator + 1)
    .replace(/[ -]/gu, '')
    .replaceAll('O', '0')
    .replace(/[IL]/gu, '1')
  return value.slice(0, separator + 1) + secret
}

export function validGuestPurchaseCode(code: string): boolean {
  const match =
    /^(?:INV-([1-9]\d{0,15})-[A-F0-9]{64}|([1-9]\d{0,15})\.[0-7][0-9A-HJKMNP-TV-Z]{25})$/u.exec(
      normalizeGuestPurchaseCode(code),
    )
  return !!match && Number.isSafeInteger(Number(match[1] ?? match[2]))
}
