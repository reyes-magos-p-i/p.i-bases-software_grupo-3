/**
 * Returns the redirect target only when it is an internal path, so the login
 * `redirect` query cannot send the user to another site.
 */
export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('\\') || /[\u0000-\u001f]/.test(value)) return null
  return value
}
