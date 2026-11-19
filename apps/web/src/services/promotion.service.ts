import { getApi } from './api'
import type { CreatePromotionPayload } from '@/types/promotion'

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
