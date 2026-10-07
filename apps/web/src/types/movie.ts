// Eventual changes, using a simple structure for mocking reasons right now

export interface Movie {
  id: number
  title: string
  runningTime: number
  posterImage: string
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
