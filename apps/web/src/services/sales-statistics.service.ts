import { getApi } from '@/services/api'
import type { SalesStatistics, SalesStatisticsQuery } from '@/types/sales-statistics'

export async function getSalesStatistics(
  query: SalesStatisticsQuery,
  signal?: AbortSignal,
): Promise<SalesStatistics> {
  const { data } = await getApi().get<SalesStatistics>('/sales-statistics', {
    params: query,
    signal,
    timeout: 15000,
  })
  return data
}
