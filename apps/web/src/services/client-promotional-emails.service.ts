import { getApi } from './api'
import { clientRequestOptions } from './authService'
import type { ClientPromotionalEmailSetting } from '@/types/client-preferences'

export async function getClientPromotionalEmailSetting(
  signal?: AbortSignal,
): Promise<ClientPromotionalEmailSetting> {
  return (
    await getApi().get<ClientPromotionalEmailSetting>('/clients/me/promotional-emails', {
      ...clientRequestOptions(),
      signal,
    })
  ).data
}

export async function saveClientPromotionalEmailSetting(
  enabled: boolean,
): Promise<ClientPromotionalEmailSetting> {
  return (
    await getApi().put<ClientPromotionalEmailSetting>(
      '/clients/me/promotional-emails',
      { enabled },
      clientRequestOptions(),
    )
  ).data
}
