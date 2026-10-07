import { getApi } from '@/services/api'
import type {
  AvailableMovie,
  CreatedProjections,
  CreateProjectionRequest,
  ProjectionSchedulingOptions,
} from '@/types/projection'

export async function getProjectionSchedulingOptions(signal?: AbortSignal) {
  const response = await getApi().get<ProjectionSchedulingOptions>('/projections/options', {
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function searchAvailableMovies(branchId: number, search: string, signal?: AbortSignal) {
  const response = await getApi().get<AvailableMovie[]>('/projections/available-movies', {
    params: { branchId, search },
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function createProjections(data: CreateProjectionRequest) {
  const response = await getApi().post<CreatedProjections>('/projections', data, {
    timeout: 30000,
  })
  return response.data
}
