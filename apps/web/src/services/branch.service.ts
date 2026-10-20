import { getApi } from '@/services/api'
import type { BranchListQuery, BranchListResult, CompanyOption } from '@/types/branch'

/** Visible branch ID, e.g. 1 → "SU-001". */
export function formatBranchId(id: number): string {
  return `SU-${String(id).padStart(3, '0')}`
}

export async function getBranches(
  query: BranchListQuery,
  signal?: AbortSignal,
): Promise<BranchListResult> {
  const response = await getApi().get<BranchListResult>('/cinemas/list', {
    params: query,
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function getCompanies(signal?: AbortSignal): Promise<CompanyOption[]> {
  const response = await getApi().get<CompanyOption[]>('/cinemas/companies', {
    signal,
    timeout: 10000,
  })
  return response.data
}
