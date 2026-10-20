
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import MovieCrudCreate from '@/components/Movies/MovieCrudCreate.vue'
import LimitedTextInput from '@/components/common/LimitedTextInput.vue'
import PositiveNumberInput from '@/components/common/PositiveNumberInput.vue'
import SimpleDropdown from '@/components/common/SimpleDropdown.vue'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'
import { createMovie } from '@/services/movie.service'

vi.mock('@/services/movie.service', () => ({
  createMovie: vi.fn()
}))

describe('MovieCrudCreate', () => {
  const props = {
    classifications: [{ id: 1, name: 'TP' }],
    languages: [{ id: 1, name: 'Español' }],
    genres: [{ id: 2, name: 'Ciencia ficción' }]
  }

  function mountForm() {
    return mount(MovieCrudCreate, {
      props,
      global: {
        stubs: {
          BaseModal: {
            template: '<div><slot /></div>'
          }
        }
      }
    })
  }

  async function fillForm(wrapper: ReturnType<typeof mountForm>) {
    const texts = wrapper.findAllComponents(LimitedTextInput)
    const numbers = wrapper.findAllComponents(PositiveNumberInput)
    const dropdowns = wrapper.findAllComponents(ReusableSearchDropdown)

    texts[0]!.vm.$emit('update:modelValue', 'Interstellar')
    texts[1]!.vm.$emit('update:modelValue', 'Space adventure')

    numbers[0]!.vm.$emit('update:modelValue', 169)
    numbers[1]!.vm.$emit('update:modelValue', 2014)

    wrapper.findComponent(SimpleDropdown)
      .vm.$emit('update:modelValue', 1)

    dropdowns[0]!.vm.$emit('update:modelValue', [1])
    dropdowns[1]!.vm.$emit('update:modelValue', [2])

    await nextTick()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables submit when the form is incomplete', async () => {
    const wrapper = mountForm()

    expect(wrapper.find('button[type="submit"]').attributes('disabled'))
      .toBeDefined()

    await wrapper.find('form').trigger('submit')

    expect(createMovie).not.toHaveBeenCalled()
  })

  it('creates a movie and emits saved and close', async () => {
    vi.mocked(createMovie).mockResolvedValue(1)

    const wrapper = mountForm()
    await fillForm(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createMovie).toHaveBeenCalledWith({
      title: 'Interstellar',
      synopsis: 'Space adventure',
      runningTime: 169,
      releaseYear: 2014,
      classificationId: 1,
      languageIds: [1],
      genreIds: [2]
    })

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits close when cancel is clicked', async () => {
    const wrapper = mountForm()

    await wrapper.find('button.secondary').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(createMovie).not.toHaveBeenCalled()
  })

  it('shows an error when creation fails', async () => {
    vi.mocked(createMovie).mockRejectedValue(new Error('Server error'))

    const wrapper = mountForm()
    await fillForm(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text())
      .toBe('No se pudo crear la película.')

    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it.each([
    [401, 'session-expired'],
    [403, 'forbidden']
  ])('emits %s error event', async (status, event) => {
    vi.mocked(createMovie).mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status }
      })
    )

    const wrapper = mountForm()
    await fillForm(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted(event)).toHaveLength(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
