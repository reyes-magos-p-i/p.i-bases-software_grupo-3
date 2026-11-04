import { describe, expect, it } from 'vitest'
import {
  movieErrorsFromApi,
  validateMovie,
  type MovieDraft,
  type MovieField,
} from '@/utils/movie-validation'

const options = {
  classifications: [{ id: 1, name: 'TP' }],
  languages: [{ id: 2, name: 'Español' }],
  genres: [{ id: 3, name: 'Drama' }],
}
const valid: MovieDraft = {
  title: 'Película',
  synopsis: 'Una aventura.',
  runningTime: 120,
  releaseYear: 2026,
  classificationId: 1,
  languageIds: [2],
  genreIds: [3],
}

describe('shared movie validation', () => {
  it('accepts a valid movie and the maximum synopsis without imposing a byte counter', () => {
    expect(validateMovie(valid, options)).toEqual({})
    expect(validateMovie({ ...valid, synopsis: '🎬'.repeat(1000) }, options)).toEqual({})
  })

  it.each<[Partial<MovieDraft>, MovieField]>([
    [{ title: ' ' }, 'title'],
    [{ title: 'a'.repeat(101) }, 'title'],
    [{ title: 'á'.repeat(51) }, 'title'],
    [{ synopsis: '' }, 'synopsis'],
    [{ synopsis: 'a'.repeat(1001) }, 'synopsis'],
    [{ synopsis: '\uD800' }, 'synopsis'],
    [{ runningTime: null }, 'runningTime'],
    [{ runningTime: 0 }, 'runningTime'],
    [{ runningTime: 1000 }, 'runningTime'],
    [{ runningTime: 1.5 }, 'runningTime'],
    [{ releaseYear: null }, 'releaseYear'],
    [{ releaseYear: 1887 }, 'releaseYear'],
    [{ releaseYear: 2078 }, 'releaseYear'],
    [{ releaseYear: 2026.5 }, 'releaseYear'],
    [{ classificationId: null }, 'classificationId'],
    [{ classificationId: 99 }, 'classificationId'],
    [{ languageIds: [] }, 'languageIds'],
    [{ genreIds: [] }, 'genreIds'],
    [{ languageIds: [2, 2] }, 'languageIds'],
    [{ genreIds: [99] }, 'genreIds'],
  ])('identifies the invalid field for %o', (change, field) => {
    const errors = validateMovie({ ...valid, ...change }, options)
    expect(errors[field]).toBeTruthy()
    expect(Object.keys(errors)).toEqual([field])
    expect(errors[field]).not.toMatch(/bytes|UTF-8|Unicode/iu)
  })

  it('preserves the existing ability to clear associations when modifying a movie', () => {
    expect(validateMovie({ ...valid, languageIds: [], genreIds: [] }, options, false)).toEqual({})
  })

  it.each([
    ['title', 'title'],
    ['sinopsis', 'synopsis'],
    ['runningTime', 'runningTime'],
    ['año', 'releaseYear'],
    ['clasificación', 'classificationId'],
    ['idiomas', 'languageIds'],
    ['géneros', 'genreIds'],
  ])('maps server validation for %s to a readable field message', (message, field) => {
    const errors = movieErrorsFromApi([message, null])
    expect(Object.keys(errors)).toEqual([field])
    expect(Object.values(errors)[0]).not.toBe(message)
  })

  it('does not expose arbitrary technical responses from the server', () => {
    expect(movieErrorsFromApi('ORA-00942: SELECT * FROM SECRET')).toEqual({})
    expect(movieErrorsFromApi(undefined)).toEqual({})
  })
})
