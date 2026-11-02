// src/services/image-handler.service.ts
import { getApi } from '@/services/api' // Adjust to its actual location.

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

  // Supports both existing paths and filename-only values.
  const filename = storedValue.split('/').pop()
  if (!filename) return null

  const imageOrigin = import.meta.env.VITE_API_URL?.trim()
  if (!imageOrigin) {
    throw new Error('Falta configurar VITE_API_URL.')
  }

  return new URL(
    `/uploads/posters/${encodeURIComponent(filename)}`,
    imageOrigin,
  ).href
}
