import { getApi } from './api'
import { clientRequestOptions } from './authService'
import type { PortalMovie } from '@/types/movie'

export function stripTrailingSlashes(str: string) {
  let i = str.length
  while (i > 0 && str.codePointAt(i - 1) === 47) i--
  return str.slice(0, i)
}

const API_BASE_URL = stripTrailingSlashes(String(import.meta.env.VITE_API_BASE_URL ?? ''))

export async function getMovieFunctions() {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not defined')
  }

  const response = await fetch(`${API_BASE_URL}/movie-fuctions`)

  if (!response.ok) {
    throw new Error(`Failed to load movie functions: ${response.status}`)
  }

  return response.json()
}
export async function getPortalMovies(
  personalized = false,
  signal?: AbortSignal,
): Promise<PortalMovie[]> {
  const options = personalized
    ? clientRequestOptions()
    : { adapter: 'fetch' as const, withCredentials: false, timeout: 10000 }
  const path = personalized ? '/clients/me/preferences/portal' : '/movie-fuctions/catalog'
  return (await getApi().get<PortalMovie[]>(path, { ...options, signal })).data
}
