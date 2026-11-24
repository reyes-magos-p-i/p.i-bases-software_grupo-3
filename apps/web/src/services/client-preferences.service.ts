import { getApi } from './api'
import { clientRequestOptions } from './authService'
import type {
  ClientPreferenceSelection,
  ClientPreferenceSettings,
} from '@/types/client-preferences'
import type { PortalRecommendations } from '@/types/portal'

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

// SCRUM-439: recommendations of the portal for the signed-in client.
export async function getPortalRecommendations(
  signal?: AbortSignal,
): Promise<PortalRecommendations> {
  return (
    await getApi().get<PortalRecommendations>('/clients/me/preferences/recommendations', {
      ...clientRequestOptions(),
      signal,
    })
  ).data
}
