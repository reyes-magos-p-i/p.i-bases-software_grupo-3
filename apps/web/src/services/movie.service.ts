import { getApi } from '@/services/api'
import type { Movie } from '@/types/movie'

export interface CreateMoviePayload {
  title: string
  synopsis: string
  runningTime: number
  releaseYear: number
  classificationId: number
  languageIds: number[]
  genreIds: number[]
}

export type UpdateMoviePayload = Partial<CreateMoviePayload>

export async function getMovies(
  signal?: AbortSignal,
): Promise<Movie[]> {
  const response = await getApi().get<Movie[]>('/movies', {
    signal,
  })

  return response.data
}

export async function getMovie(
  id: number,
  signal?: AbortSignal,
): Promise<Movie> {
  const response = await getApi().get<Movie>(
    `/movies/${id}`,
    {
      signal,
    },
  )

  return response.data
}

export async function createMovie(
  payload: CreateMoviePayload,
): Promise<number> {
  const response = await getApi().post<number>(
    '/movies',
    payload,
  )

  return response.data
}

export async function updateMovie(
  id: number,
  payload: UpdateMoviePayload,
): Promise<void> {
  await getApi().patch(
    `/movies/${id}`,
    payload,
  )
}

export async function deleteMovie(
  id: number,
): Promise<void> {
  await getApi().delete(
    `/movies/${id}`,
  )
}
