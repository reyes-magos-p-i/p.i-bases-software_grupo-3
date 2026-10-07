import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { isAxiosError } from 'axios'

import MovieCrudView from '@/components/Movies/MovieCrudView.vue'
import { getMovie } from '@/services/movie.service'
import type { MovieDetail } from '@/types/movie'

vi.mock('@/services/movie.service', () => ({
  getMovie: vi.fn(),
}))

vi.mock('axios', () => ({
  isAxiosError: vi.fn(),
}))

const BaseModalStub = {
  name: 'BaseModal',
  props: ['open', 'title'],
  emits: ['close'],
  template: `
    <div v-if="open" data-test="base-modal">
      <h2 data-test="modal-title">{{ title }}</h2>
      <slot />
    </div>
  `,
}

describe('MovieCrudView', () => {
  const movieDetail = {
    id: 24,
    title: 'Interstellar',
    synopsis: 'A team travels through space searching for a new home.',
    runningTime: 169,
    releaseYear: 2014,

    classification: {
      id: 1,
      name: 'TP',
    },

    languages: [
      {
        id: 1,
        name: 'English',
      },
      {
        id: 2,
        name: 'Spanish',
      },
    ],

    genres: [
      {
        id: 3,
        name: 'Science Fiction',
      },
      {
        id: 4,
        name: 'Drama',
      },
    ],
  } as MovieDetail

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isAxiosError).mockReturnValue(false)
  })

  function createWrapper(movieId: number | null = 24) {
    return mount(MovieCrudView, {
      props: {
        movieId,
      },

      global: {
        stubs: {
          BaseModal: BaseModalStub,
        },
      },
    })
  }

  it('loads the selected movie', async () => {
    vi.mocked(getMovie).mockResolvedValue(movieDetail)

    createWrapper()

    await flushPromises()

    expect(getMovie).toHaveBeenCalledOnce()
    expect(getMovie).toHaveBeenCalledWith(
      24,
      expect.any(AbortSignal),
    )
  })

  it('does not request a movie when movieId is null', async () => {
    const wrapper = createWrapper(null)

    await flushPromises()

    expect(getMovie).not.toHaveBeenCalled()

    const modal = wrapper.findComponent(BaseModalStub)

    expect(modal.props('open')).toBe(false)
  })

  it('shows a loading message while the movie is loading', async () => {
    let resolveRequest!: (movie: MovieDetail) => void

    vi.mocked(getMovie).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )

    const wrapper = createWrapper()

    expect(wrapper.get('[role="status"]').text()).toContain(
      'Cargando datos de la película',
    )

    resolveRequest(movieDetail)

    await flushPromises()

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('uses the movie title in the modal title', async () => {
    vi.mocked(getMovie).mockResolvedValue(movieDetail)

    const wrapper = createWrapper()

    await flushPromises()

    const modal = wrapper.findComponent(BaseModalStub)

    expect(modal.props('title')).toBe(
      'Detalle de Interstellar',
    )
  })

  it('renders the movie information', async () => {
    vi.mocked(getMovie).mockResolvedValue(movieDetail)

    const wrapper = createWrapper()

    await flushPromises()

    const text = wrapper.text()

    expect(text).toContain('MOV24')
    expect(text).toContain('Interstellar')
    expect(text).toContain('2014')
    expect(text).toContain('TP')
    expect(text).toContain('English, Spanish')
    expect(text).toContain('Science Fiction, Drama')
    expect(text).toContain(
      'A team travels through space searching for a new home.',
    )
  })

  it('formats movie duration correctly', async () => {
    vi.mocked(getMovie).mockResolvedValue(movieDetail)

    const wrapper = createWrapper()

    await flushPromises()

    // 169 minutes = 2 h 49 min
    expect(wrapper.text()).toContain('2 h 49 min')
  })

  it('shows Sin registrar for missing optional values', async () => {
    const incompleteMovie: MovieDetail = {
    ...movieDetail,
    synopsis: null,
    releaseYear: null,
    classification: {
      id: 1,
      name: '',
    },
    languages: [],
    genres: [],
    }

    vi.mocked(getMovie).mockResolvedValue(incompleteMovie)

    const wrapper = createWrapper()

    await flushPromises()

    expect(wrapper.text()).toContain('Sin registrar')
  })

  it('loads another movie when movieId changes', async () => {
    vi.mocked(getMovie)
      .mockResolvedValueOnce(movieDetail)
      .mockResolvedValueOnce({
        ...movieDetail,
        id: 25,
        title: 'Inception',
      })

    const wrapper = createWrapper(24)

    await flushPromises()

    expect(getMovie).toHaveBeenCalledWith(
      24,
      expect.any(AbortSignal),
    )

    await wrapper.setProps({
      movieId: 25,
    })

    await flushPromises()

    expect(getMovie).toHaveBeenCalledTimes(2)

    expect(getMovie).toHaveBeenLastCalledWith(
      25,
      expect.any(AbortSignal),
    )

    expect(wrapper.text()).toContain('Inception')
  })

  it('emits close when Cerrar is clicked', async () => {
    vi.mocked(getMovie).mockResolvedValue(movieDetail)

    const wrapper = createWrapper()

    await flushPromises()

    const closeButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cerrar')

    expect(closeButton).toBeDefined()

    await closeButton!.trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('shows session expired error and emits session-expired on 401', async () => {
    const failure = {
      response: {
        status: 401,
      },
    }

    vi.mocked(isAxiosError).mockReturnValue(true)
    vi.mocked(getMovie).mockRejectedValue(failure)

    const wrapper = createWrapper()

    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'La sesión ha expirado',
    )

    expect(
      wrapper.emitted('session-expired'),
    ).toHaveLength(1)
  })

  it('shows forbidden error and emits forbidden on 403', async () => {
    const failure = {
      response: {
        status: 403,
      },
    }

    vi.mocked(isAxiosError).mockReturnValue(true)
    vi.mocked(getMovie).mockRejectedValue(failure)

    const wrapper = createWrapper()

    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'No tienes permiso para ver esta película.',
    )

    expect(wrapper.emitted('forbidden')).toHaveLength(1)
  })

  it('shows not found error on 404', async () => {
    const failure = {
      response: {
        status: 404,
      },
    }

    vi.mocked(isAxiosError).mockReturnValue(true)
    vi.mocked(getMovie).mockRejectedValue(failure)

    const wrapper = createWrapper()

    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'La película seleccionada ya no existe.',
    )

    expect(
      wrapper.find('button').text(),
    ).not.toContain('Reintentar')
  })

  it('shows retry button for an unexpected error', async () => {
    vi.mocked(getMovie).mockRejectedValue(
      new Error('Network error'),
    )

    const wrapper = createWrapper()

    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'No se pudo mostrar la película.',
    )

    const retryButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reintentar')

    expect(retryButton).toBeDefined()
  })

  it('retries loading when Reintentar is clicked', async () => {
    vi.mocked(getMovie)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(movieDetail)

    const wrapper = createWrapper()

    await flushPromises()

    expect(getMovie).toHaveBeenCalledTimes(1)

    const retryButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reintentar')

    expect(retryButton).toBeDefined()

    await retryButton!.trigger('click')

    await flushPromises()

    expect(getMovie).toHaveBeenCalledTimes(2)

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Interstellar')
  })
})
