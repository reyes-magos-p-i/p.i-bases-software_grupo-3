import { readonly, ref, shallowRef } from 'vue'
import { fbAuth, logoutFromFacebook } from '@/facebook-auth'
import type { ClientIdentity, ClientSessionStatus } from '@/types/client-auth'
import { AuthResponseError, authErrorMessage } from '@/utils/auth-errors'

export const CLIENT_ACCESS_TOKEN_KEY = 'accessToken'

const user = shallowRef<ClientIdentity | null>(null)
const status = ref<ClientSessionStatus>('unknown')
const error = ref('')
let revision = 0
let restoration: Promise<ClientIdentity | null> | undefined

export const clientSession = { user, status: readonly(status), error: readonly(error) }

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
    throw new AuthResponseError()
  const lastName = 'lastName' in value ? value.lastName : (Reflect.get(value, 'firstSurname') ?? '')
  if (lastName !== null && typeof lastName !== 'string') throw new AuthResponseError()
  return { id: value.id, email: value.email, firstName: value.firstName, lastName: lastName ?? '' }
}

export function hasClientSession(): boolean {
  return Boolean(localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY))
}

export function establishClientSession(identity: ClientIdentity, accessToken: string): void {
  const verifiedIdentity = clientIdentityFromResponse(identity)
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw new AuthResponseError()
  localStorage.setItem(CLIENT_ACCESS_TOKEN_KEY, accessToken)
  revision++
  restoration = undefined
  user.value = verifiedIdentity
  status.value = 'authenticated'
  error.value = ''
}

export function clearClientSession(): void {
  localStorage.removeItem(CLIENT_ACCESS_TOKEN_KEY)
  revision++
  restoration = undefined
  user.value = null
  status.value = 'anonymous'
  error.value = ''
}

export function reportClientSessionError(failure: unknown) {
  error.value = authErrorMessage(failure, 'No se pudo comprobar la sesión. Inténtalo nuevamente.')
}

export function restoreClientSession(
  load: (token: string) => Promise<ClientIdentity | null>,
): Promise<ClientIdentity | null> {
  if (restoration) return restoration
  const current = revision
  const pending = Promise.resolve()
    .then(async () => {
      if (current !== revision) return user.value
      const token = localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)
      if (!token) {
        if (user.value) clearClientSession()
        else {
          status.value = 'anonymous'
          error.value = ''
        }
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
      error.value = ''
      return user.value
    })
    .catch((error_: unknown) => {
      if (current !== revision) return user.value
      user.value = null
      status.value = 'error'
      reportClientSessionError(error_)
      throw error_
    })
    .finally(() => {
      if (restoration === pending) restoration = undefined
    })
  restoration = pending
  return pending
}

export async function clearClientAuth(): Promise<void> {
  // Local logout must not depend on a third-party SDK being available.
  clearClientSession()
  if (fbAuth.status === 'connected') await logoutFromFacebook()
}

export function clientSessionRevision(): number {
  return revision
}

export function beginClientSessionChange(): number {
  restoration = undefined
  return ++revision
}
