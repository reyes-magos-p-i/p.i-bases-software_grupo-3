import { shallowRef } from 'vue'
import type { ClientIdentity } from '@/types/client-auth'

const user = shallowRef<ClientIdentity | null>(null)

export const clientSession = { user }

export function establishClientSession(identity: ClientIdentity, accessToken: string): void {
  localStorage.setItem('accessToken', accessToken)
  user.value = identity
}

export function clearClientSession(): void {
  localStorage.removeItem('accessToken')
  user.value = null
}
