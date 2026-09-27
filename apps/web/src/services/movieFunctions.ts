const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function getMovieFunctions() {
  const response = await fetch(`${API_BASE_URL}movie-fuctions`);

  if (!response.ok) {
    throw new Error(`Failed to load movie functions: ${response.status}`);
  }

  return response.json();
}