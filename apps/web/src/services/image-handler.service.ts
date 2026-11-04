// src/services/image-handler.service.ts
import { getApi } from '@/services/api' // Adjust to its actual location.
import { stripTrailingSlashes } from '@/services/movieFunctions'

export interface PosterUploadResponse {
  filename: string
  path: string
}

export async function uploadPoster(
  file: File,
): Promise<PosterUploadResponse> {
  const data = new FormData()
  data.append('image', file)

  const response = await getApi().post<PosterUploadResponse>(
    '/image-handler/posters',
    data,
  )

  return response.data
}

export function getPosterUrl(
  storedValue?: string | null,
): string | null {
  if (!storedValue) return null

  const filename = storedValue.split('/').pop()
  if (!filename) return null

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (!apiBaseUrl) {
    throw new Error('Falta configurar VITE_API_BASE_URL.')
  }

  // Posters saved before uploads existed store only a file name and are served by the image route.
  if (!storedValue.includes('/')) {
    return `${stripTrailingSlashes(apiBaseUrl)}/image/${encodeURIComponent(filename)}`
  }

  const imageOrigin = apiBaseUrl.startsWith('/')
    ? window.location.origin
    : new URL(apiBaseUrl).origin

  return new URL(
    `/uploads/posters/${encodeURIComponent(filename)}`,
    imageOrigin,
  ).href
}
