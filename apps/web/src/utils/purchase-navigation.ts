const PROFILE_PATH = '/account/profile'

export function parsePurchaseId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/u.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function purchaseLocation(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new RangeError('La compra no es válida.')
  return { path: PROFILE_PATH, query: { section: 'purchases', purchaseId: String(id) } }
}

export function purchaseLoginQuery(route: { path: string; query?: Record<string, unknown> }) {
  const id =
    route.path === PROFILE_PATH && route.query?.section === 'purchases'
      ? parsePurchaseId(route.query.purchaseId)
      : null
  return id === null ? {} : { purchaseId: String(id) }
}
