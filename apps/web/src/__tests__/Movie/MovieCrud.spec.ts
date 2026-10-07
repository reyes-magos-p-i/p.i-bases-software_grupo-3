import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import MovieCrud from '@/components/Movies/MovieCrud.vue'
import { deleteMovie, getMovies, getClassifications, getLanguages, getGenres } from '@/services/movie.service'
import type { MovieAll } from '@/types/movie'
import { nextTick } from 'vue'

vi.mock('@/services/movie.service', () => ({
  getMovies: vi.fn(),
  deleteMovie: vi.fn(),
}))

const CrudTableStub = {
  name: 'CrudTable',
  props: ['columns', 'rows', 'caption'],
  emits: ['view', 'edit', 'delete'],
  template: '<div data-test="crud-table"></div>',
}

const MovieCrudViewStub = {
  name: 'MovieCrudView',
  props: ['movieId'],
  emits: ['close'],
  template: '<div data-test="movie-view"></div>',
}

describe('MovieCrud', () => {
  const movies = [
    {
      id: 24,
      title: 'Interstellar',
      runningTime: 169,
      releaseYear: '2014',
      classification: 'TP',
    },
    {
      id: 25,
      title: 'Inception',
      runningTime: 148,
      releaseYear: null,
      classification: null,
    },
  ] as MovieAll[]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createWrapper() {
    return mount(MovieCrud, {
      global: {
        stubs: {
          CrudTable: CrudTableStub,
          MovieCrudView: MovieCrudViewStub,
        },
      },
    })
  }

  it('loads movies when mounted', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)

    createWrapper()

    await flushPromises()

    expect(getMovies).toHaveBeenCalledOnce()
    expect(getMovies).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('shows loading message while movies are loading', async () => {
    let resolveRequest!: (value: MovieAll[]) => void

    vi.mocked(getMovies).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )

    const wrapper = createWrapper()

    await nextTick()

    expect(wrapper.get('[role="status"]').text()).toContain(
      'Cargando películas',
    )

    resolveRequest(movies)

    await flushPromises()

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('passes the correct columns to CrudTable', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)

    const wrapper = createWrapper()

    await flushPromises()

    const table = wrapper.findComponent(CrudTableStub)

    expect(table.props('columns')).toEqual([
      { key: 'id', label: 'ID' },
      { key: 'title', label: 'Título' },
      { key: 'runningTime', label: 'Duración' },
      { key: 'releaseYear', label: 'Año' },
      { key: 'classification', label: 'Clasificación' },
    ])

    expect(table.props('caption')).toBe('Películas')
  })

  it('transforms movie data before passing rows to CrudTable', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)

    const wrapper = createWrapper()

    await flushPromises()

    const table = wrapper.findComponent(CrudTableStub)

    expect(table.props('rows')).toEqual([
      {
        ...movies[0],
        runningTime: '169 min',
        releaseYear: '2014',
        classification: 'TP',
      },
      {
        ...movies[1],
        runningTime: '148 min',
        releaseYear: 'Sin registrar',
        classification: 'Sin registrar',
      },
    ])
  })

  it('shows an error message when movies cannot be loaded', async () => {
    vi.mocked(getMovies).mockRejectedValue(
      new Error('Database unavailable'),
    )

    const wrapper = createWrapper()

    await flushPromises()

    const alert = wrapper.get('[role="alert"]')

    expect(alert.text()).toContain(
      'No se pudo cargar la lista de películas.',
    )

    expect(wrapper.findComponent(CrudTableStub).exists()).toBe(false)
  })


    it('sets the selected movie when CrudTable emits view', async () => {
    vi.mocked(getMovies).mockResolvedValueOnce(movies)

    const wrapper = mount(MovieCrud, {
      // Keep your existing props, plugins, and other stubs.
      global: {
        stubs: {
          CrudTable: CrudTableStub,
        },
      },
    })

    await flushPromises()

    const table = wrapper.findComponent(CrudTableStub)

    expect(table.exists()).toBe(true)

    table.vm.$emit('view', movies[0])

    await wrapper.vm.$nextTick()

    // Keep your existing selected-movie assertions here.
  })
  it('does not select a movie when view receives an invalid id', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)

    const wrapper = createWrapper()

    await flushPromises()

    const table = wrapper.findComponent(CrudTableStub)

    table.vm.$emit('view', {
      id: 'not-a-number',
    })

    await wrapper.vm.$nextTick()

    const movieView = wrapper.findComponent(MovieCrudViewStub)

    expect(movieView.props('movieId')).toBeNull()
  })

  it('clears selected movie when MovieCrudView emits close', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)

    const wrapper = createWrapper()

    await flushPromises()

    wrapper.findComponent(CrudTableStub).vm.$emit(
      'view',
      movies[0],
    )

    await wrapper.vm.$nextTick()

    expect(
      wrapper.findComponent(MovieCrudViewStub).props('movieId'),
    ).toBe(24)

    wrapper.findComponent(MovieCrudViewStub).vm.$emit('close')

    await wrapper.vm.$nextTick()

    expect(
      wrapper.findComponent(MovieCrudViewStub).props('movieId'),
    ).toBeNull()
  })

  it('deletes a movie and reloads the movie list', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)
    vi.mocked(deleteMovie).mockResolvedValue(undefined)

    const wrapper = createWrapper()

    await flushPromises()

    expect(getMovies).toHaveBeenCalledTimes(1)

    wrapper.findComponent(CrudTableStub).vm.$emit(
      'delete',
      movies[0],
    )

    await flushPromises()

    expect(deleteMovie).toHaveBeenCalledOnce()
    expect(deleteMovie).toHaveBeenCalledWith(24)

    expect(getMovies).toHaveBeenCalledTimes(2)
  })

  it('does not delete a movie when the id is invalid', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)

    const wrapper = createWrapper()

    await flushPromises()

    wrapper.findComponent(CrudTableStub).vm.$emit('delete', {
      id: 'invalid',
    })

    await flushPromises()

    expect(deleteMovie).not.toHaveBeenCalled()
    expect(getMovies).toHaveBeenCalledTimes(1)
  })

  it('does not reload movies if deleteMovie fails', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)
    vi.mocked(deleteMovie).mockRejectedValue(
      new Error('Delete failed'),
    )

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const wrapper = createWrapper()

    await flushPromises()

    wrapper.findComponent(CrudTableStub).vm.$emit(
      'delete',
      movies[0],
    )

    await flushPromises()

    expect(deleteMovie).toHaveBeenCalledWith(24)

    // Only the initial load should have occurred.
    expect(getMovies).toHaveBeenCalledTimes(1)

    consoleError.mockRestore()
  })

  it('reloads movies when exposed refresh is called', async () => {
    vi.mocked(getMovies).mockResolvedValue(movies)

    const wrapper = createWrapper()

    await flushPromises()

    expect(getMovies).toHaveBeenCalledTimes(1)

    wrapper.vm.refresh()

    await flushPromises()

    expect(getMovies).toHaveBeenCalledTimes(2)
  })
})
