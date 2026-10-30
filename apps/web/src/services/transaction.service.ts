import { getApi } from '@/services/api'
import type {
  TransactionFilterOptions,
  TransactionListQuery,
  TransactionListResult,
} from '@/types/transaction'

export async function getTransactions(
  query: TransactionListQuery,
  signal?: AbortSignal,
): Promise<TransactionListResult> {
  const response = await getApi().get<TransactionListResult>('/transactions', {
    params: query,
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function getTransactionFilterOptions(
  signal?: AbortSignal,
): Promise<TransactionFilterOptions> {
  const response = await getApi().get<TransactionFilterOptions>('/transactions/filter-options', {
    signal,
    timeout: 10000,
  })
  return response.data
}
