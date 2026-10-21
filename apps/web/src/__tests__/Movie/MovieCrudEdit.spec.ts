
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

// BaseModal stub
const BaseModalStub = defineComponent({
  props: ['open', 'title', 'closeDisabled'],
  emits: ['close'],
  template: `
    <div v-if="open">
      <h2>{{ title }}</h2>
      <button
        type="button"
        data-test="modal-close"
        :disabled="closeDisabled"
        @click="$emit('close')"
      >
        Close modal
      </button>
      <slot />
    </div>
  `,
})

// LimitedTextInput stub
const LimitedTextInputStub = defineComponent({
  props: ['modelValue', 'label', 'multiline'],
  emits: ['update:modelValue'],
  template: `
    <div>
      <label>{{ label }}</label>

      <textarea
        v-if="multiline"
        :data-test="label"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
      />

      <input
        v-else
        type="text"
        :data-test="label"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </div>
  `,
})

// PositiveNumberInput stub
const PositiveNumberInputStub = defineComponent({
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template: `
    <div>
      <label>{{ label }}</label>

      <input
        type="number"
        :data-test="label"
        :value="modelValue ?? ''"
        @input="$emit(
          'update:modelValue',
          $event.target.value === ''
            ? null
            : Number($event.target.value)
        )"
      />
    </div>
  `,
})

// SimpleDropdown stub
const SimpleDropdownStub = defineComponent({
  props: ['modelValue', 'label', 'options'],
  emits: ['update:modelValue'],
  template: `
    <div>
      <label>{{ label }}</label>

      <select
        :data-test="label"
        :value="modelValue ?? ''"
        @change="$emit(
          'update:modelValue',
          $event.target.value === ''
            ? null
            : Number($event.target.value)
        )"
      >
        <option value="">Seleccione una opción</option>

        <option
          v-for="option in options"
          :key="option.id"
          :value="option.id"
        >
          {{ option.name }}
        </option>
      </select>
    </div>
  `,
})

// ReusableSearchDropdown stub
const ReusableSearchDropdownStub = defineComponent({
  props: ['modelValue', 'label', 'options'],
  emits: ['update:modelValue'],
  template: `
    <div :data-test="label">
      <label>{{ label }}</label>

      <label
        v-for="option in options"
        :key="option.value"
      >
        <input
          type="checkbox"
          :value="option.value"
          :checked="modelValue.includes(option.value)"
          @change="$emit(
            'update:modelValue',
            $event.target.checked
              ? [...modelValue, option.value]
              : modelValue.filter(id => id !== option.value)
          )"
        />

        {{ option.label }}
      </label>
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
        LimitedTextInput: LimitedTextInputStub,
        PositiveNumberInput: PositiveNumberInputStub,
        SimpleDropdown: SimpleDropdownStub,
        ReusableSearchDropdown: ReusableSearchDropdownStub,
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

  it('loads existing movie values', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(getMovieMock).toHaveBeenCalledWith(
      24,
      expect.any(AbortSignal),
    )

    expect(
      wrapper.get<HTMLInputElement>('input[data-test="Título"]').element.value,
    ).toBe('Interstellar')

    expect(
      wrapper.get<HTMLInputElement>(
        'input[data-test="Duración en minutos"]',
      ).element.value,
    ).toBe('169')

    expect(
      wrapper.get<HTMLSelectElement>(
        'select[data-test="Clasificación"]',
      ).element.value,
    ).toBe('1')

    expect(
      wrapper.get<HTMLInputElement | HTMLTextAreaElement>(
        '[data-test="Sinopsis"]',
      ).element.value,
    ).toBe('A journey through space.')

    wrapper.unmount()
  })

  it('loads classification, language and genre options', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.text()).toContain('12+')
    expect(wrapper.text()).toContain('Spanish')
    expect(wrapper.text()).toContain('Drama')

    expect(
      wrapper.get<HTMLInputElement>(
        '[data-test="Idiomas"] input[value="1"]',
      ).element.checked,
    ).toBe(true)

    expect(
      wrapper.get<HTMLInputElement>(
        '[data-test="Idiomas"] input[value="2"]',
      ).element.checked,
    ).toBe(false)

    expect(
      wrapper.get<HTMLInputElement>(
        '.option-fieldset input[value="3"]',
      ).element.checked,
    ).toBe(true)

    wrapper.unmount()
  })

  it('disables Save when nothing has changed', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(
      wrapper.get<HTMLButtonElement>('button[type="submit"]')
        .element.disabled,
    ).toBe(true)

    expect(updateMovieMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('enables Save after a valid change', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('input[data-test="Título"]')
      .setValue('Interstellar Updated')

    expect(
      wrapper.get<HTMLButtonElement>('button[type="submit"]')
        .element.disabled,
    ).toBe(false)

    wrapper.unmount()
  })

  it('disables Save for an empty title', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('input[data-test="Título"]')
      .setValue('   ')

    expect(
      wrapper.get<HTMLButtonElement>('button[type="submit"]')
        .element.disabled,
    ).toBe(true)

    expect(updateMovieMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('disables Save for an invalid duration', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('input[data-test="Duración en minutos"]')
      .setValue('0')

    expect(
      wrapper.get<HTMLButtonElement>('button[type="submit"]')
        .element.disabled,
    ).toBe(true)

    wrapper.unmount()
  })

  it('saves valid changes', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('input[data-test="Título"]')
      .setValue('Interstellar Updated')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateMovieMock).toHaveBeenCalledWith(
      24,
      expect.objectContaining({
        title: 'Interstellar Updated',
        runningTime: 169,
        releaseYear: 2014,
        classificationId: 1,
        languageIds: [1],
        genreIds: [3],
      }),
      expect.any(AbortSignal),
    )

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('keeps edited values when saving fails', async () => {
    updateMovieMock.mockRejectedValueOnce(
      new Error('Network failure'),
    )

    const wrapper = mountModal()
    await flushPromises()

    await wrapper.get('input[data-test="Título"]')
      .setValue('Unsaved changes')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text())
      .toContain('No se pudieron guardar')

    expect(
      wrapper.get<HTMLInputElement>(
        'input[data-test="Título"]',
      ).element.value,
    ).toBe('Unsaved changes')

    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()

    wrapper.unmount()
  })

  it('prevents duplicate saves while pending', async () => {
    const pending = deferred<void>()
    updateMovieMock.mockReturnValueOnce(pending.promise)

    const wrapper = mountModal()
    await flushPromises()

    // A change is now required before saving
    await wrapper.get('input[data-test="Título"]')
      .setValue('Updated title')

    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(updateMovieMock).toHaveBeenCalledTimes(1)

    expect(
      wrapper.get<HTMLButtonElement>('button[type="submit"]')
        .element.disabled,
    ).toBe(true)

    pending.resolve(undefined)
    await flushPromises()

    expect(wrapper.emitted('saved')).toHaveLength(1)

    wrapper.unmount()
  })

  it.each([
    [401, 'session-expired'],
    [403, 'forbidden'],
  ] as const)(
    'handles a %s load response',
    async (status, event) => {
      getMovieMock.mockRejectedValueOnce(
        httpError(status, 'Access denied'),
      )

      const wrapper = mountModal()
      await flushPromises()

      expect(wrapper.emitted(event)).toHaveLength(1)
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)

      wrapper.unmount()
    },
  )

  it('shows when the movie no longer exists', async () => {
    getMovieMock.mockRejectedValueOnce(
      httpError(404, 'Not found'),
    )

    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text())
      .toContain('ya no existe')

    wrapper.unmount()
  })

  it('retries a failed load', async () => {
    getMovieMock.mockRejectedValueOnce(
      new Error('Network failure'),
    )

    const wrapper = mountModal()
    await flushPromises()

    const retry = wrapper
      .findAll('button')
      .find(button => button.text() === 'Reintentar')

    expect(retry).toBeDefined()

    await retry!.trigger('click')
    await flushPromises()

    expect(getMovieMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('form').exists()).toBe(true)

    wrapper.unmount()
  })

  it('displays backend validation errors', async () => {
    updateMovieMock.mockRejectedValueOnce(
      httpError(400, 'Invalid movie data'),
    )

    const wrapper = mountModal()
    await flushPromises()

    // Must change something before submitting
    await wrapper.get('input[data-test="Título"]')
      .setValue('Updated title')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text())
      .toContain('Invalid movie data')

    expect(wrapper.emitted('saved')).toBeUndefined()

    wrapper.unmount()
  })

  it('aborts loading when unmounted', () => {
    getMovieMock.mockReturnValueOnce(
      new Promise<Awaited<ReturnType<typeof getMovie>>>(
        () => {},
      ),
    )

    const wrapper = mountModal()
    const signal = getMovieMock.mock.calls[0]?.[1]

    wrapper.unmount()

    expect(signal?.aborted).toBe(true)
  })
})
