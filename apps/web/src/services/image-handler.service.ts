import { getApi } from '@/services/api'

export interface PosterUploadResponse {
  filename: string
  path: string
}

export async function uploadPoster(file: File): Promise<PosterUploadResponse> {
  const data = new FormData()
  data.append('image', file)

  const response = await getApi().post<PosterUploadResponse>('/image-handler/posters', data)

  return response.data
}

export function getPosterUrl(
  storedValue?: string | null,
  legacy = false,
): string | null {
  if (!storedValue) return null

  const filename = storedValue.split('/').pop()
  if (!filename) return null

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (!apiBaseUrl) {
    throw new Error('Falta configurar VITE_API_BASE_URL.')
  }

  const base = new URL(apiBaseUrl, window.location.origin)

  // Your local base has no path; NestJS still requires /api.
  if (base.pathname === '/') {
    base.pathname = '/api/'
  } else if (!base.pathname.endsWith('/')) {
    base.pathname += '/'
  }

  const path = legacy
    ? `image/${encodeURIComponent(filename)}`
    : `image-handler/posters/${encodeURIComponent(filename)}`

  return new URL(path, base).href
}
