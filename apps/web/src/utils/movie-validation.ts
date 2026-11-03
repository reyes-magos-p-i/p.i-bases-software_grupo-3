import type { MovieOption } from '@/types/movie'
import { characterCount, validText } from '@/utils/user-validation'

export const MOVIE_TITLE_LIMIT = 100
export const MOVIE_SYNOPSIS_LIMIT = 1000

export interface MovieDraft {
  title: string
  synopsis: string
  runningTime: number | null
  releaseYear: number | null
  classificationId: number | null
  languageIds: number[]
  genreIds: number[]
}
export type MovieField = keyof MovieDraft
export type MovieErrors = Partial<Record<MovieField, string>>
interface Catalogs {
  classifications: readonly MovieOption[]
  languages: readonly MovieOption[]
  genres: readonly MovieOption[]
}

function textError(value: string, limit: number, storageLimit: number): string | undefined {
  if (!value.trim()) return 'Este campo es obligatorio.'
  if (characterCount(value.trim()) > limit) return `Escribe como máximo ${limit} caracteres.`
  if (!validText(value.trim(), storageLimit))
    return 'El texto es demasiado largo o contiene caracteres no admitidos.'
}

function selectionError(
  ids: number[],
  options: readonly MovieOption[],
  required: boolean,
): string | undefined {
  if (required && !ids.length) return 'Selecciona al menos una opción.'
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !options.some((option) => option.id === id))
  ) {
    return 'Selecciona únicamente opciones disponibles, sin repetirlas.'
  }
}

export function validateMovie(
  form: MovieDraft,
  catalogs: Catalogs,
  requireSelections = true,
): MovieErrors {
  const errors: MovieErrors = {}
  errors.title = textError(form.title, MOVIE_TITLE_LIMIT, 100)
  errors.synopsis = textError(form.synopsis, MOVIE_SYNOPSIS_LIMIT, 4000)
  if (
    !Number.isInteger(form.runningTime) ||
    form.runningTime === null ||
    form.runningTime < 1 ||
    form.runningTime > 999
  ) {
    errors.runningTime = 'Escribe una duración entre 1 y 999 minutos, sin decimales.'
  }
  if (
    !Number.isInteger(form.releaseYear) ||
    form.releaseYear === null ||
    form.releaseYear < 1888 ||
    form.releaseYear > 2077
  ) {
    errors.releaseYear = 'Escribe un año entre 1888 y 2077, sin decimales.'
  }
  if (!catalogs.classifications.some((option) => option.id === form.classificationId)) {
    errors.classificationId = 'Selecciona una clasificación disponible.'
  }
  errors.languageIds = selectionError(form.languageIds, catalogs.languages, requireSelections)
  errors.genreIds = selectionError(form.genreIds, catalogs.genres, requireSelections)
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message))
}

export function movieErrorsFromApi(value: unknown): MovieErrors {
  const rules: [MovieField, RegExp, string][] = [
    ['title', /título|title/iu, 'Revisa el título de la película.'],
    ['synopsis', /sinopsis|synopsis/iu, 'Revisa la sinopsis de la película.'],
    [
      'runningTime',
      /duración|runningTime/iu,
      'Escribe una duración entre 1 y 999 minutos, sin decimales.',
    ],
    ['releaseYear', /año|releaseYear/iu, 'Escribe un año entre 1888 y 2077, sin decimales.'],
    [
      'classificationId',
      /clasificación|classificationId/iu,
      'Selecciona una clasificación disponible.',
    ],
    [
      'languageIds',
      /idioma|languageIds/iu,
      'Selecciona únicamente idiomas disponibles, sin repetirlos.',
    ],
    ['genreIds', /género|genreIds/iu, 'Selecciona únicamente géneros disponibles, sin repetirlos.'],
  ]
  const errors: MovieErrors = {}
  for (const message of Array.isArray(value) ? value : [value]) {
    if (typeof message !== 'string') continue
    const rule = rules.find(([, pattern]) => pattern.test(message))
    if (rule) errors[rule[0]] = rule[2]
  }
  return errors
}
