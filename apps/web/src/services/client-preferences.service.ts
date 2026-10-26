import { getApi } from './api'
import { clientRequestOptions } from './authService'
import type {
  ClientPreferenceSelection,
  ClientPreferenceSettings,
} from '@/types/client-preferences'

export async function getClientPreferenceSettings(
  signal?: AbortSignal,
): Promise<ClientPreferenceSettings> {
  return (
    await getApi().get<ClientPreferenceSettings>('/clients/me/preferences', {
      ...clientRequestOptions(),
      signal,
    })
  ).data
}

export async function saveClientPreferences(
  selected: ClientPreferenceSelection,
): Promise<ClientPreferenceSelection> {
  return (
    await getApi().put<ClientPreferenceSelection>(
      '/clients/me/preferences',
      selected,
      clientRequestOptions(),
    )
  ).data
}
