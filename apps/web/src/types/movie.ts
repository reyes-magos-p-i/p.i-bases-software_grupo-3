// Eventual changes, using a simple structure for mocking reasons right now

export interface Movie {
  title: string
  posterImage: string
}

export interface MovieAll {
  id: number
  title: string
  runningTime: number
  releaseYear: number | null
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
  posterImage?: string | null
  /** YYYY-MM-DD; null when the movie is already showing (SCRUM-437). */
  releaseDate?: string | null
  /** YYYY-MM-DD; null when it has no presale. */
  presaleStart?: string | null
  classification: MovieOption
  languages: MovieOption[]
  genres: MovieOption[]
  /** Active branches where the movie is available. */
  branches?: MovieOption[]
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

export interface PortalMovie extends Movie {
  id: number
}
