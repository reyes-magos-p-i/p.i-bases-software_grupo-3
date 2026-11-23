import { getApi } from './api'
import type { CreatePromotionPayload } from '@/types/promotion'
import type { PromotionDetail, PromotionListItem } from '@/types/promotion-read'

export async function createPromotion(
  payload: CreatePromotionPayload,
): Promise<{ promotionId: number }> {
  const response = await getApi().post<{ promotionId: number }>(
    '/promotions',
    payload,
    { withCredentials: true },
  )

  return response.data
}

/** Administrative catalog, including future and expired promotions. */
export async function getPromotions(signal?: AbortSignal): Promise<PromotionListItem[]> {
  const response = await getApi().get<PromotionListItem[]>('/promotions', {
    withCredentials: true,
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function getPromotion(id: number, signal?: AbortSignal): Promise<PromotionDetail> {
  const response = await getApi().get<PromotionDetail>(`/promotions/${id}`, {
    withCredentials: true,
    signal,
    timeout: 10000,
  })
  return response.data
}
