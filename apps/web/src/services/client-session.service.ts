import { readonly, ref, shallowRef } from 'vue'
import type { ClientIdentity, ClientSessionStatus } from '@/types/client-auth'

const user = shallowRef<ClientIdentity | null>(null)
const status = ref<ClientSessionStatus>('unknown')
let revision = 0
let restoration: Promise<ClientIdentity | null> | undefined

export const clientSession = { user, status: readonly(status) }

export function clientIdentityFromResponse(value: unknown): ClientIdentity {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id < 1 ||
    !('email' in value) ||
    typeof value.email !== 'string' ||
    !value.email.trim() ||
    !('firstName' in value) ||
    typeof value.firstName !== 'string' ||
    !value.firstName.trim() ||
    'role' in value
  )
    throw new Error('No se pudo verificar la sesión del cliente.')
  const lastName = 'lastName' in value ? value.lastName : (Reflect.get(value, 'firstSurname') ?? '')
  if (lastName !== null && typeof lastName !== 'string')
    throw new Error('No se pudo verificar la sesión del cliente.')
  return { id: value.id, email: value.email, firstName: value.firstName, lastName: lastName ?? '' }
}

export function establishClientSession(identity: ClientIdentity, accessToken: string): void {
  const verifiedIdentity = clientIdentityFromResponse(identity)
  if (typeof accessToken !== 'string' || !accessToken.trim())
    throw new Error('No se pudo verificar la sesión del cliente.')
  localStorage.setItem('accessToken', accessToken)
  revision++
  restoration = undefined
  user.value = verifiedIdentity
  status.value = 'authenticated'
}

export function clearClientSession(): void {
  localStorage.removeItem('accessToken')
  revision++
  restoration = undefined
  user.value = null
  status.value = 'anonymous'
}

export function restoreClientSession(
  load: (token: string) => Promise<ClientIdentity | null>,
): Promise<ClientIdentity | null> {
  if (restoration) return restoration
  const current = revision
  const pending = Promise.resolve()
    .then(async () => {
      if (current !== revision) return user.value
      const token = localStorage.getItem('accessToken')
      if (!token) {
        clearClientSession()
        return null
      }
      status.value = 'loading'
      const identity = await load(token)
      // A logout or a newer login must win over an older session lookup.
      if (current !== revision) return user.value
      if (!identity) {
        clearClientSession()
        return null
      }
      user.value = clientIdentityFromResponse(identity)
      status.value = 'authenticated'
      return user.value
    })
    .catch((error: unknown) => {
      if (current !== revision) return user.value
      user.value = null
      status.value = 'error'
      throw error
    })
    .finally(() => {
      if (restoration === pending) restoration = undefined
    })
  restoration = pending
  return pending
}
