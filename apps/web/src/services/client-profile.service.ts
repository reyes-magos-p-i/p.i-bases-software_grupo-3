import { isAxiosError } from 'axios'
import { getApi } from './api'
import { clientRequestOptions } from './authService'
import { authErrorMessage, authErrorStatus } from '@/utils/auth-errors'
import type {
  ClientAddressOptions,
  ClientProfile,
  ClientProfileUpdate,
} from '@/types/client-profile'

export async function getClientProfile(signal?: AbortSignal): Promise<ClientProfile> {
  return (await getApi().get<ClientProfile>('/clients/me', { ...clientRequestOptions(), signal }))
    .data
}

export async function getClientAddressOptions(signal?: AbortSignal): Promise<ClientAddressOptions> {
  return (
    await getApi().get<ClientAddressOptions>('/clients/me/address-options', {
      ...clientRequestOptions(),
      signal,
    })
  ).data
}

export async function updateClientProfile(changes: ClientProfileUpdate): Promise<void> {
  await getApi().patch('/clients/me', changes, clientRequestOptions())
}

export async function deactivateClientProfile(): Promise<void> {
  await getApi().patch('/clients/me/deactivate', {}, clientRequestOptions())
}

export async function requestClientEmailChange(email: string): Promise<void> {
  await getApi().post(
    '/clients/me/email-change',
    { email },
    { ...clientRequestOptions(), timeout: 60000 },
  )
}

export async function confirmClientEmailChange(token: string): Promise<{ clientId: number }> {
  return (
    await getApi().post<{ clientId: number }>(
      '/clients/email-change/confirm',
      { token },
      {
        adapter: 'fetch',
        withCredentials: false,
        timeout: 10000,
      },
    )
  ).data
}

export function clientProfileError(error: unknown, fallback: string): string {
  const status = authErrorStatus(error)
  if (status === 401) return 'Tu sesión terminó. Inicia sesión nuevamente.'
  if (status === 429)
    return 'Has realizado demasiadas solicitudes. Espera un minuto e intenta nuevamente.'
  if ([400, 409, 410, 422].includes(status ?? 0) && isAxiosError(error)) {
    const message: unknown = error.response?.data?.message
    if (typeof message === 'string') return message
    if (Array.isArray(message) && message.every((item) => typeof item === 'string'))
      return message.join(' ')
  }
  return authErrorMessage(error, fallback)
}
