const encoder = new TextEncoder()

export function characterCount(value: string): number {
  return Array.from(value).length
}

export function validText(value: string, maxBytes: number): boolean {
  return !/[\uD800-\uDFFF]/u.test(value) && encoder.encode(value).length <= maxBytes
}

export function normalizeMobile(value: string): string {
  const match = /^(?:\+506[ -]?)?([678]\d{3})[ -]?(\d{4})$/u.exec(value.trim())
  return match ? match[1]! + match[2]! : value.trim()
}

export function validMobile(value: string): boolean {
  return /^[678]\d{7}$/u.test(normalizeMobile(value))
}

export function validEmail(value: string): boolean {
  const email = value.trim().toLowerCase()
  const local = email.split('@')[0] ?? ''
  return (
    validText(email, 150) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) &&
    /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/iu.test(email.split('.').pop() ?? '') &&
    !local.startsWith('.') &&
    !local.endsWith('.') &&
    !local.includes('..') &&
    encoder.encode(local).length <= 64
  )
}
