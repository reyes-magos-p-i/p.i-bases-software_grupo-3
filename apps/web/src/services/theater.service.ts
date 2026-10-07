import { getApi } from '@/services/api'
import type {
  CreateTheaterRequest,
  Theater,
  TheaterCinema,
  TheaterProjector,
  UpdateTheaterRequest,
} from '@/types/theater'

export async function getTheaters(signal?: AbortSignal): Promise<Theater[]> {
  const response = await getApi().get<Theater[]>('/theaters', { signal, timeout: 10000 })
  return response.data
}

export async function getTheaterCreationOptions(signal?: AbortSignal) {
  const [projectors, cinemas] = await Promise.all([
    getApi().get<TheaterProjector[]>('/projectors', { signal, timeout: 10000 }),
    getApi().get<TheaterCinema[]>('/cinemas', { signal, timeout: 10000 }),
  ])
  return { projectors: projectors.data, cinemas: cinemas.data }
}

export async function createTheater(data: CreateTheaterRequest): Promise<Theater> {
  const response = await getApi().post<Theater>('/theaters', data, { timeout: 30000 })
  return response.data
}

export async function updateTheater(id: number, data: UpdateTheaterRequest): Promise<Theater> {
  const response = await getApi().patch<Theater>(`/theaters/${id}`, data, { timeout: 30000 })
  return response.data
}

export async function deleteTheater(id: number): Promise<void> {
  await getApi().delete(`/theaters/${id}`, { timeout: 30000 })
}
