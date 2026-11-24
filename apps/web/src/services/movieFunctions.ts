import { getApi } from './api'
import type { PortalSection, PortalSectionMovie } from '@/types/portal'

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
// SCRUM-437: one public request per section; the same for visitors and clients.
export async function getPortalSection(
  section: PortalSection,
  signal?: AbortSignal,
): Promise<PortalSectionMovie[]> {
  const options = { adapter: 'fetch' as const, withCredentials: false, timeout: 10000, signal }
  const path = `/movie-fuctions/sections/${encodeURIComponent(section)}`
  return (await getApi().get<PortalSectionMovie[]>(path, options)).data
}
