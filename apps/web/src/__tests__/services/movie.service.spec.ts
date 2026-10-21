
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  getMovies,
  getMovie,
  createMovie,
  updateMovie,
  deleteMovie,
  getClassifications,
  getGenres,
  getLanguages
} from '@/services/movie.service'

// Mock the API methods
const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

vi.mock('@/services/api', () => ({
  getApi: () => api
}))

describe('Movie Service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('gets all movies', async () => {
    const movies = [{ id: 24, title: 'Interstellar' }]
    api.get.mockResolvedValue({ data: movies })

    const result = await getMovies()

    expect(api.get).toHaveBeenCalledWith('/movies', {
      signal: undefined
    })
    expect(result).toEqual(movies)
  })

  it('gets a movie by ID', async () => {
    const movie = { id: 24, title: 'Interstellar' }
    api.get.mockResolvedValue({ data: movie })

    const result = await getMovie(24)

    expect(api.get).toHaveBeenCalledWith('/movies/24', {
      signal: undefined
    })
    expect(result).toEqual(movie)
  })

  it('creates a movie', async () => {
    const payload = {
      title: 'Interstellar',
      synopsis: 'Space adventure',
      runningTime: 169,
      releaseYear: 2014,
      classificationId: 1,
      languageIds: [1],
      genreIds: [2]
    }

    api.post.mockResolvedValue({ data: 24 })

    const result = await createMovie(payload)

    expect(api.post).toHaveBeenCalledWith('/movies', payload)
    expect(result).toBe(24)
  })

  it('updates a movie', async () => {
    const payload = { title: 'Updated title' }

    api.patch.mockResolvedValue({})

    await updateMovie(24, payload)

    expect(api.patch).toHaveBeenCalledWith(
      '/movies/24',
      payload,
      { signal: undefined }
    )
  })

  it('deletes a movie', async () => {
    api.delete.mockResolvedValue({})

    await deleteMovie(24)

    expect(api.delete).toHaveBeenCalledWith('/movies/24')
  })

  it('gets classifications', async () => {
    const classifications = [{ id: 1, name: 'TP' }]
    api.get.mockResolvedValue({ data: classifications })

    const result = await getClassifications()

    expect(api.get).toHaveBeenCalledWith('/movies/classifications')
    expect(result).toEqual(classifications)
  })

  it('gets genres', async () => {
    const genres = [{ id: 2, name: 'Aventura' }]
    api.get.mockResolvedValue({ data: genres })

    const result = await getGenres()

    expect(api.get).toHaveBeenCalledWith('/movies/genres')
    expect(result).toEqual(genres)
  })

  it('gets languages', async () => {
    const languages = [{ id: 1, name: 'Español' }]
    api.get.mockResolvedValue({ data: languages })

    const result = await getLanguages()

    expect(api.get).toHaveBeenCalledWith('/movies/languages')
    expect(result).toEqual(languages)
  })

  it('passes the abort signal to API requests', async () => {
    const signal = new AbortController().signal
    api.get.mockResolvedValue({ data: [] })
    api.patch.mockResolvedValue({})

    await getMovies(signal)
    await getMovie(24, signal)
    await updateMovie(24, { title: 'Updated' }, signal)

    expect(api.get).toHaveBeenCalledWith('/movies', { signal })
    expect(api.get).toHaveBeenCalledWith('/movies/24', { signal })
    expect(api.patch).toHaveBeenCalledWith(
      '/movies/24',
      { title: 'Updated' },
      { signal }
    )
  })
})
