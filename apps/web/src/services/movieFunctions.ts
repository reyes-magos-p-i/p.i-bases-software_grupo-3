export function stripTrailingSlashes(str: string) {
  let i = str.length;
  while (i > 0 && str.charCodeAt(i - 1) === 47) i--;
  return str.slice(0, i);
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