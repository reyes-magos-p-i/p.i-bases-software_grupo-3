import { shallowRef } from 'vue'
import type { ClientIdentity } from '@/types/client-auth'
import { fbAuth, logoutFromFacebook } from '@/facebook-auth'

const user = shallowRef<ClientIdentity | null>(null)

export const CLIENT_ACCESS_TOKEN_KEY = 'accessToken'

export const clientSession = { user }

export function hasClientSession(): boolean {
  return Boolean(localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)) || fbAuth.status === 'connected'
}

export function establishClientSession(identity: ClientIdentity, accessToken: string): void {
  localStorage.setItem(CLIENT_ACCESS_TOKEN_KEY, accessToken)
  user.value = identity
}

export function clearClientSession(): void {
  localStorage.removeItem(CLIENT_ACCESS_TOKEN_KEY)
  user.value = null
}

export async function clearClientAuth(): Promise<void> {
  if (fbAuth.status === 'connected') await logoutFromFacebook()
  clearClientSession()
}
