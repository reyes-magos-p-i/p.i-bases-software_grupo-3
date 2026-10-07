import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MovieCrudEdit from '@/components/Movies/MovieCrudEdit.vue'
import { getMovie, updateMovie } from '@/services/movie.service'

vi.mock('@/services/movie.service', () => ({
  getMovie: vi.fn(),
  updateMovie: vi.fn(),
}))

const getMovieMock = vi.mocked(getMovie)
const updateMovieMock = vi.mocked(updateMovie)

const BaseModalStub = defineComponent({
  props: ['open', 'title'],
  emits: ['close'],
  template: `
    <div v-if="open">
      <h2>{{ title }}</h2>
      <button data-test="modal-close" @click="$emit('close')">
        Close modal
      </button>
      <slot />
    </div>
  `,
})

const movie = {
  id: 24,
  title: 'Interstellar',
  synopsis: 'A journey through space.',
  posterImage: null,
  runningTime: 169,
  releaseYear: 2014,
  classification: { id: 1, name: 'TP' },
  languages: [{ id: 1, name: 'English' }],
  genres: [{ id: 3, name: 'Science fiction' }],
}

function mountModal(movieId: number | null = 24) {
  return mount(MovieCrudEdit, {
    props: {
      movieId,
      classifications: [
        { id: 1, name: 'TP' },
        { id: 2, name: '12+' },
      ],
      languages: [
        { id: 1, name: 'English' },
        { id: 2, name: 'Spanish' },
      ],
      genres: [
        { id: 3, name: 'Science fiction' },
        { id: 4, name: 'Drama' },
      ],
    },
    global: {
      stubs: {
        BaseModal: BaseModalStub,
      },
    },
  })
}

function httpError(status: number, message: string) {
  const failure = new AxiosError(message)

  failure.response = {
    status,
    statusText: '',
    data: { message },
    headers: {},
    config: { headers: {} },
  } as NonNullable<AxiosError['response']>

  return failure
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void

  const promise = new Promise<T>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

describe('MovieCrudEdit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getMovieMock.mockResolvedValue(movie)
    updateMovieMock.mockResolvedValue(undefined)
  })

  it('does not fetch a movie when closed', async () => {
    const wrapper = mountModal(null)
    await flushPromises()

    expect(getMovieMock).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(false)

    wrapper.unmount()
  })

  it('loads existing values and catalog options', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(getMovieMock).toHaveBeenCalledWith(
      24,
      expect.any(AbortSignal),
    )

    expect(
      wrapper.get<HTMLInputElement>('#movie-title').element.value,
    ).toBe('Interstellar')

    expect(
      wrapper.get<HTMLInputElement>('#movie-duration').element.value,
    ).toBe('169')

    expect(
      wrapper.get<HTMLSelectElement>('#movie-classification').element.value,
    ).toBe('1')

    expect(wrapper.get('#movie-classification').text()).toContain('12+')
    expect(wrapper.text()).toContain('Spanish')
    expect(wrapper.text()).toContain('Drama')

    const checked = wrapper
      .findAll<HTMLInputElement>('input[type="checkbox"]')
      .filter((checkbox) => checkbox.element.checked)
      .map((checkbox) => checkbox.element.value)

    expect(checked).toEqual(['1', '3'])

    wrapper.unmount()
  })

  it('sends edited values and emits saved and close', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('#movie-title').setValue('  Updated movie  ')
    await wrapper.get('#movie-synopsis').setValue('  Updated synopsis  ')
    await wrapper.get('#movie-duration').setValue('120')
    await wrapper.get('#movie-year').setValue('2020')
    await wrapper.get('#movie-classification').setValue('2')

    const checkboxes =
      wrapper.findAll<HTMLInputElement>('input[type="checkbox"]')

    await checkboxes[0]!.setValue(false)
    await checkboxes[1]!.setValue(true)
    await checkboxes[2]!.setValue(false)
    await checkboxes[3]!.setValue(true)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateMovieMock).toHaveBeenCalledWith(
      24,
      {
        title: 'Updated movie',
        synopsis: 'Updated synopsis',
        runningTime: 120,
        releaseYear: 2020,
        classificationId: 2,
        languageIds: [2],
        genreIds: [4],
        posterImage: 'default-poster',
      },
      expect.any(AbortSignal),
    )

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('rejects a whitespace-only title', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('#movie-title').setValue('   ')
    await wrapper.get('form').trigger('submit')

    expect(updateMovieMock).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Completa los campos',
    )

    wrapper.unmount()
  })

  it('keeps edited values when saving fails', async () => {
    updateMovieMock.mockRejectedValueOnce(new Error('Network failure'))

    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('#movie-title').setValue('Unsaved changes')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'No se pudieron guardar',
    )

    expect(
      wrapper.get<HTMLInputElement>('#movie-title').element.value,
    ).toBe('Unsaved changes')

    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()

    wrapper.unmount()
  })

  it('prevents duplicate saves while a request is pending', async () => {
    const pending = deferred<void>()
    updateMovieMock.mockReturnValueOnce(pending.promise)

    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(updateMovieMock).toHaveBeenCalledTimes(1)
    expect(
      wrapper.get<HTMLButtonElement>('button[type="submit"]').element.disabled,
    ).toBe(true)

    pending.resolve(undefined)
    await flushPromises()

    expect(wrapper.emitted('saved')).toHaveLength(1)

    wrapper.unmount()
  })

  it.each([
    [401, 'session-expired'],
    [403, 'forbidden'],
  ] as const)('handles a %s load response', async (status, event) => {
    getMovieMock.mockRejectedValueOnce(httpError(status, 'Access denied'))

    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.emitted(event)).toHaveLength(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('shows when the movie no longer exists', async () => {
    getMovieMock.mockRejectedValueOnce(httpError(404, 'Not found'))

    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('ya no existe')

    wrapper.unmount()
  })

  it('retries a failed load', async () => {
    getMovieMock.mockRejectedValueOnce(new Error('Network failure'))

    const wrapper = mountModal()
    await flushPromises()

    const retry = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reintentar')

    expect(retry).toBeDefined()

    await retry!.trigger('click')
    await flushPromises()

    expect(getMovieMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('form').exists()).toBe(true)

    wrapper.unmount()
  })

  it('displays backend validation errors when saving', async () => {
    updateMovieMock.mockRejectedValueOnce(
      httpError(400, 'posterImage should not be empty'),
    )

    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'posterImage should not be empty',
    )
    expect(wrapper.emitted('saved')).toBeUndefined()

    wrapper.unmount()
  })

  it('aborts loading when the component unmounts', () => {
    getMovieMock.mockReturnValueOnce(
      new Promise<Awaited<ReturnType<typeof getMovie>>>(() => {}),
    )

    const wrapper = mountModal()
    const signal = getMovieMock.mock.calls[0]?.[1]

    wrapper.unmount()

    expect(signal?.aborted).toBe(true)
  })
})
