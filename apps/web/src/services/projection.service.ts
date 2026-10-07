import { getApi } from '@/services/api'
import type {
  AvailableMovie,
  CreatedProjections,
  CreateProjectionRequest,
  ProjectionDetail,
  ProjectionFilterOptions,
  ProjectionList,
  ProjectionListQuery,
  ProjectionSchedulingOptions,
  UpdateProjectionRequest,
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

export async function getProjectionFilterOptions(signal?: AbortSignal) {
  const response = await getApi().get<ProjectionFilterOptions>('/projections/filter-options', {
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function getProjections(query: ProjectionListQuery, signal?: AbortSignal) {
  const response = await getApi().get<ProjectionList>('/projections', {
    params: query,
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function getProjectionDetail(id: number, signal?: AbortSignal) {
  const response = await getApi().get<ProjectionDetail>(`/projections/${id}`, {
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function updateProjection(id: number, data: UpdateProjectionRequest) {
  const response = await getApi().put<ProjectionDetail>(`/projections/${id}`, data, {
    timeout: 30000,
  })
  return response.data
}

export async function createProjections(data: CreateProjectionRequest) {
  const response = await getApi().post<CreatedProjections>('/projections', data, {
    timeout: 30000,
  })
  return response.data
}
