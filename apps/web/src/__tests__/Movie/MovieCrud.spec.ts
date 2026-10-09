import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'

import MovieCrud from '@/components/Movies/MovieCrud.vue'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import MovieCrudView from '@/components/Movies/MovieCrudView.vue'
import MovieCrudEdit from '@/components/Movies/MovieCrudEdit.vue'

import {
  getMovies,
  deleteMovie,
  getClassifications,
  getGenres,
  getLanguages,
} from '@/services/movie.service'

vi.mock('@/services/movie.service', () => ({
  getMovies: vi.fn(),
  deleteMovie: vi.fn(),
  getClassifications: vi.fn(),
  getGenres: vi.fn(),
  getLanguages: vi.fn(),
}))

describe('MovieCrud', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    vi.mocked(getMovies).mockResolvedValue([])
    vi.mocked(deleteMovie).mockResolvedValue(undefined)

    vi.mocked(getClassifications).mockResolvedValue([
      { id: 1, name: 'TP' },
    ])
    vi.mocked(getGenres).mockResolvedValue([
      { id: 3, name: 'Drama' },
    ])
    vi.mocked(getLanguages).mockResolvedValue([
      { id: 1, name: 'English' },
    ])
  })

  it('loads movies and passes catalog options to the edit modal', async () => {
    const wrapper = shallowMount(MovieCrud)

    await flushPromises()

    expect(getMovies).toHaveBeenCalledOnce()
    expect(wrapper.findComponent(CrudTable).exists()).toBe(true)

    const editModal = wrapper.findComponent(MovieCrudEdit)

    expect(editModal.props('classifications')).toEqual([
      { id: 1, name: 'TP' },
    ])
    expect(editModal.props('genres')).toEqual([
      { id: 3, name: 'Drama' },
    ])
    expect(editModal.props('languages')).toEqual([
      { id: 1, name: 'English' },
    ])

    wrapper.unmount()
  })

  it('selects the movie for viewing and clears it on close', async () => {
    const wrapper = shallowMount(MovieCrud)
    await flushPromises()

    wrapper.findComponent(CrudTable).vm.$emit('view', { id: 24 })
    await nextTick()

    const viewModal = wrapper.findComponent(MovieCrudView)

    expect(viewModal.props('movieId')).toBe(24)
    expect(
      wrapper.findComponent(MovieCrudEdit).props('movieId'),
    ).toBeNull()

    viewModal.vm.$emit('close')
    await nextTick()

    expect(viewModal.props('movieId')).toBeNull()

    wrapper.unmount()
  })

  it('selects the movie for editing and clears it on close', async () => {
    const wrapper = shallowMount(MovieCrud)
    await flushPromises()

    wrapper.findComponent(CrudTable).vm.$emit('edit', { id: 24 })
    await nextTick()

    const editModal = wrapper.findComponent(MovieCrudEdit)

    expect(editModal.props('movieId')).toBe(24)
    expect(
      wrapper.findComponent(MovieCrudView).props('movieId'),
    ).toBeNull()

    editModal.vm.$emit('close')
    await nextTick()

    expect(editModal.props('movieId')).toBeNull()

    wrapper.unmount()
  })

  it('deletes the selected movie and reloads the list', async () => {
    const wrapper = shallowMount(MovieCrud)
    await flushPromises()

    wrapper.findComponent(CrudTable).vm.$emit('delete', { id: 24 })
    await flushPromises()

    expect(deleteMovie).toHaveBeenCalledWith(24)
    expect(getMovies).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('retries loading after a movie request fails', async () => {
    vi.mocked(getMovies)
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockResolvedValueOnce([])

    const wrapper = shallowMount(MovieCrud)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'No se pudo cargar la lista de películas.',
    )
    expect(wrapper.findComponent(CrudTable).exists()).toBe(false)

    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(getMovies).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findComponent(CrudTable).exists()).toBe(true)

    wrapper.unmount()
  })

  it('reloads movies after the edit modal emits saved', async () => {
    const wrapper = shallowMount(MovieCrud)
    await flushPromises()

    wrapper.findComponent(MovieCrudEdit).vm.$emit('saved')
    await flushPromises()

    expect(getMovies).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
})
