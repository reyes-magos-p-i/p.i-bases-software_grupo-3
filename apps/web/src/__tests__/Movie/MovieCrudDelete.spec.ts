
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import MovieCrudDelete from '@/components/Movies/MovieCrudDelete.vue'
import { deleteMovie } from '@/services/movie.service'

vi.mock('@/services/movie.service', () => ({
  deleteMovie: vi.fn()
}))

describe('MovieCrudDelete', () => {
  const movie = {
    id: 24,
    title: 'Interstellar'
  }

  function mountModal() {
    return mount(MovieCrudDelete, {
      props: { movie },
      global: {
        stubs: {
          BaseModal: {
            template: '<div><slot /></div>'
          }
        }
      }
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('displays the movie title', () => {
    const wrapper = mountModal()

    expect(wrapper.text()).toContain('Interstellar')
    expect(wrapper.text()).toContain('Esta acción no se puede deshacer.')
  })

  it('emits close when cancel is clicked', async () => {
    const wrapper = mountModal()

    await wrapper.find('button.secondary').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(deleteMovie).not.toHaveBeenCalled()
  })

  it('deletes the movie and emits events', async () => {
    vi.mocked(deleteMovie).mockResolvedValue(undefined)

    const wrapper = mountModal()

    await wrapper.find('button.danger').trigger('click')
    await flushPromises()

    expect(deleteMovie).toHaveBeenCalledWith(24)
    expect(wrapper.emitted('deleted')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('shows an error when deletion fails', async () => {
    vi.mocked(deleteMovie).mockRejectedValue(
      new Error('Server error')
    )

    const wrapper = mountModal()

    await wrapper.find('button.danger').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text())
      .toBe('No se pudo eliminar la película.')

    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it.each([
    [401, 'La sesión ha expirado.'],
    [403, 'No tienes permiso para eliminar esta película.'],
    [404, 'La película ya no existe.']
  ])('shows the correct error for HTTP %s', async (status, message) => {
    vi.mocked(deleteMovie).mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status }
      })
    )

    const wrapper = mountModal()

    await wrapper.find('button.danger').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(message)
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })
})
