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
  const separator = email.indexOf('@')
  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  const lastDot = domain.lastIndexOf('.')
  return (
    validText(email, 150) &&
    separator > 0 &&
    separator === email.lastIndexOf('@') &&
    lastDot > 0 &&
    !/\s/u.test(email) &&
    /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/iu.test(domain.slice(lastDot + 1)) &&
    !local.startsWith('.') &&
    !local.endsWith('.') &&
    !local.includes('..') &&
    encoder.encode(local).length <= 64
  )
}
