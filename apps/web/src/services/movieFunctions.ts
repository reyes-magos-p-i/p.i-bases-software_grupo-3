const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '')
  .replace(/\/+$/, '')

export async function getMovieFunctions() {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not defined')
  }

  const response = await fetch(`${API_BASE_URL}/movie-functions`)

  if (!response.ok) {
    throw new Error(`Failed to load movie functions: ${response.status}`)
  }

  return response.json()
}