import { getApi } from '@/services/api'
import type {  MovieAll, MovieDetail, MovieOption  } from '@/types/movie'

export interface CreateMoviePayload {
  title: string
  synopsis: string
  runningTime: number
  posterImage: string
  releaseYear: number
  classificationId: number
  languageIds: number[]
  genreIds: number[]
}


export type UpdateMoviePayload = Partial<CreateMoviePayload>

export async function getMovies(
  signal?: AbortSignal,
): Promise<MovieAll[]> {
  const response = await getApi().get<MovieAll[]>('/movies', {
    signal,
  })

  return response.data
}

export async function getMovie(
  id: number,
  signal?: AbortSignal,
): Promise<MovieDetail> {
  const response = await getApi().get<MovieDetail>(
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
  signal?: AbortSignal,
): Promise<void> {
  await getApi().patch(
    `/movies/${id}`,
    payload,
    { signal }
  )
}

export async function deleteMovie(
  id: number,
): Promise<void> {
  await getApi().delete(
    `/movies/${id}`,
  )
}

export async function getClassifications(): Promise<MovieOption[]> {
  const response = await getApi().get<MovieOption[]>(
    '/movies/classifications',
  )

  return response.data
}

export async function getGenres(): Promise<MovieOption[]> {
  const response = await getApi().get<MovieOption[]>('/movies/genres')
  return response.data
}

export async function getLanguages(): Promise<MovieOption[]> {
  const response = await getApi().get<MovieOption[]>('/movies/languages')
  return response.data
}
