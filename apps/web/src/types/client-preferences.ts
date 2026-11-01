import type { MovieOption } from './movie'

export interface ClientPreferenceSelection {
  genreIds: number[]
  languageIds: number[]
}

export interface ClientPreferenceSettings {
  genres: MovieOption[]
  languages: MovieOption[]
  selected: ClientPreferenceSelection
  maxSelections: number
}
