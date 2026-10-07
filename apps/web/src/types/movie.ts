// Eventual changes, using a simple structure for mocking reasons right now

export interface Movie{
  title: string
  posterImage: string

}

export interface MovieAll {
  id: number
  title: string
  runningTime: number
  releaseYear: string | null
  classification: string
}

export interface MovieOption {
  id: number
  name: string
}

export interface MovieDetail {
  id: number
  title: string
  synopsis: string | null
  runningTime: number
  releaseYear: number | null

  classification: MovieOption

  languages: MovieOption[]
  genres: MovieOption[]
}

export type UpdateMoviePayload = {
  title: string
  synopsis: string
  runningTime: number
  releaseYear: number
  classificationId: number
  languageIds: number[]
  genreIds: number[]
}
