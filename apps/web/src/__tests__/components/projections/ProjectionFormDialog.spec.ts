import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ProjectionFormDialog from '@/components/projections/ProjectionFormDialog.vue'
import type { AvailableMovie } from '@/types/projection'

const { searchAvailableMovies } = vi.hoisted(() => ({ searchAvailableMovies: vi.fn() }))
vi.mock('@/services/projection.service', () => ({ searchAvailableMovies }))

const spiderMan: AvailableMovie = {
  movieId: 3,
  title: 'Spider-Man: Brand New Day',
  runningTime: 190,
  posterImage: 'spiderman.jpg',
}
const odyssey: AvailableMovie = { movieId: 4, title: 'The Odyssey', runningTime: 170, posterImage: 'o.jpg' }
const props = {
  cinemas: [
    { branchId: 2, name: 'Mall Oxígeno' },
    { branchId: 5, name: 'Multiplaza' },
  ],
  theaters: [
    { theaterId: 7, branchId: 2, numberOfSeats: 80 },
    { theaterId: 9, branchId: 5, numberOfSeats: 120 },
  ],
}

let wrapper: VueWrapper<InstanceType<typeof ProjectionFormDialog>> | undefined
const dialogPrototype = HTMLDialogElement.prototype

function render(extra: Record<string, unknown> = {}) {
  wrapper = mount(ProjectionFormDialog, { props: { ...props, ...extra }, attachTo: document.body })
  wrapper.vm.open()
  return wrapper
}

const field = (name: string) => wrapper!.get(`[name="${name}"]`)

async function searchMovie(text: string) {
  await field('movie').setValue(text)
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}

async function fillValidForm() {
  await field('branchId').setValue('2')
  await field('theaterId').setValue('7')
  await searchMovie('spi')
  await field('movie').trigger('keydown', { key: 'Enter' })
  await field('startDate').setValue('2099-07-21')
  await field('startTime').setValue('21:00')
  await field('price').setValue('4500.50')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  searchAvailableMovies.mockReset().mockResolvedValue([spiderMan, odyssey])
  Object.defineProperties(dialogPrototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '')
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute('open')
      }),
    },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  Reflect.deleteProperty(dialogPrototype, 'showModal')
  Reflect.deleteProperty(dialogPrototype, 'close')
  document.body.innerHTML = ''
})

describe('ProjectionFormDialog', () => {
  it('schedules a projection with the suggested end time', async () => {
    render()
    expect(wrapper!.get('h2').text()).toBe('Agregar nueva proyección')
    expect(field('movie').attributes('disabled')).toBeDefined()

    await field('branchId').setValue('2')
    expect(wrapper!.findAll('[name="theaterId"] option').map((option) => option.text())).toEqual([
      'Selecciona una sala',
      'Sala 7 (80 asientos)',
    ])
    await fillValidForm()

    expect(searchAvailableMovies).toHaveBeenCalledExactlyOnceWith(2, 'spi', expect.any(AbortSignal))
    expect(field('movie').element).toHaveProperty('value', spiderMan.title)
    expect(wrapper!.get('img').attributes('src')).toContain('/image/spiderman.jpg')
    expect(wrapper!.get<HTMLInputElement>('[readonly]').element.value).toBe('190')
    expect(field('endTime').element).toHaveProperty('value', '00:55')
    expect(wrapper!.get('.schedule-summary').text()).toBe(
      'Anuncios 15 min + película 190 min + limpieza 30 min = 235 min. La sala queda ocupada de 21:00 a 00:55 del día siguiente.',
    )
    expect(wrapper!.get('.poster-title').text()).toBe(spiderMan.title)
    expect(field('price').attributes('aria-describedby')).toMatch(/-price-hint$/)

    await field('startTime').setValue('')
    expect(wrapper!.get('.schedule-summary').text()).toBe(
      'Anuncios 15 min + película 190 min + limpieza 30 min = 235 min.',
    )
    await field('startTime').setValue('18:00')
    expect(wrapper!.get('.schedule-summary').text()).toContain('de 18:00 a 21:55.')
    await field('startTime').setValue('21:00')

    await field('status').setValue('INACTIVE')
    expect(wrapper!.get('.form-warning').text()).toContain('no será visible para los Clientes')

    await wrapper!.get('form').trigger('submit')
    expect(wrapper!.emitted('submit')).toEqual([
      [
        {
          movieId: 3,
          theaterId: 7,
          startDate: '2099-07-21',
          endDate: '2099-07-21',
          startTime: '21:00',
          endTime: '00:55',
          cleaningMinutes: 30,
          advertisementMinutes: 15,
          price: 4500.5,
          status: 'INACTIVE',
        },
      ],
    ])
  })

  it('validates every field before submitting', async () => {
    render()
    await wrapper!.get('form').trigger('submit')
    await flushPromises()

    const messages = wrapper!.findAll('.field-error').map((error) => error.text())
    expect(messages).toEqual(
      expect.arrayContaining([
        'Selecciona una sucursal.',
        'Selecciona una película disponible de la lista.',
        'Selecciona una sala disponible.',
        'Selecciona la fecha de la proyección.',
        'Selecciona la hora de inicio.',
        'Selecciona la hora de fin.',
        'El precio debe ser un número positivo en colones.',
      ]),
    )
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true')
    expect(wrapper!.emitted('submit')).toBeUndefined()
  })

  it('validates dates, activity minutes, price and the minimum end time', async () => {
    render()
    await fillValidForm()
    await field('endDate').setValue('2099-07-20')
    await field('cleaningMinutes').setValue('241')
    await field('price').setValue('10.123')
    await field('endTime').setValue('00:54')
    await field('endTime').trigger('change')
    await wrapper!.get('form').trigger('submit')

    const text = wrapper!.text()
    expect(text).toContain('La fecha final no puede ser anterior a la fecha inicial.')
    expect(text).toContain('Introduce minutos enteros entre 0 y 240.')
    expect(text).toContain('El precio debe ser un número positivo en colones.')
    expect(text).toContain('La hora de fin debe ser igual o posterior a las')

    await field('endDate').setValue('2099-08-25')
    expect(wrapper!.text()).toContain('El rango no puede superar 31 días.')
    await field('startDate').setValue('2000-01-01')
    expect(wrapper!.text()).toContain('La fecha de la proyección no puede estar en el pasado.')
    expect(wrapper!.emitted('submit')).toBeUndefined()
  })

  it('keeps an end time edited by the administrator', async () => {
    render()
    await fillValidForm()
    await field('endTime').setValue('02:30')
    await field('endTime').trigger('change')
    await field('advertisementMinutes').setValue('20')
    expect(field('endTime').element).toHaveProperty('value', '02:30')

    await field('endTime').setValue('01:00')
    await field('endTime').trigger('change')
    await field('advertisementMinutes').setValue('25')
    expect(field('endTime').element).toHaveProperty('value', '01:05')
  })

  it('searches as the administrator types and lets them pick with the mouse or keyboard', async () => {
    render()
    await field('branchId').setValue('2')
    await searchMovie('the')
    await field('movie').trigger('keydown', { key: 'ArrowDown' })
    await field('movie').trigger('keydown', { key: 'ArrowUp' })
    await field('movie').trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper!.get('[aria-selected="true"]').text()).toContain('The Odyssey')
    await field('movie').trigger('keydown', { key: 'Escape' })
    expect(field('movie').attributes('aria-expanded')).toBe('false')

    await searchMovie('spid')
    await wrapper!.findAll('[role="option"]')[0]!.trigger('mousedown')
    expect(field('movie').element).toHaveProperty('value', spiderMan.title)

    await field('movie').setValue('Spider')
    expect(wrapper!.get('img').attributes('src')).not.toContain('spiderman.jpg')
    await field('movie').trigger('keydown', { key: 'Enter' })
    await field('movie').trigger('blur')
    expect(wrapper!.text()).toContain('Selecciona una película disponible de la lista.')
  })

  it('reports empty and failed searches', async () => {
    const sessionWrapper = render()
    await field('branchId').setValue('2')
    expect(wrapper!.text()).not.toContain('Buscando películas…')

    searchAvailableMovies.mockResolvedValueOnce([])
    await searchMovie('zzz')
    expect(wrapper!.text()).toContain('No hay películas disponibles con ese nombre en esta sucursal.')

    searchAvailableMovies.mockRejectedValueOnce(new Error('offline'))
    await searchMovie('zz')
    expect(wrapper!.get('[role="alert"]').text()).toBe(
      'No se pudieron buscar películas. Inténtalo nuevamente.',
    )

    searchAvailableMovies.mockRejectedValueOnce({ response: { status: 401 } })
    await searchMovie('z')
    expect(sessionWrapper.emitted('sessionExpired')).toHaveLength(1)
  })

  it('ignores searches replaced by newer input', async () => {
    render()
    await field('branchId').setValue('2')
    let resolveFirst!: (movies: AvailableMovie[]) => void
    searchAvailableMovies.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
    await searchMovie('spi')
    searchAvailableMovies.mockRejectedValueOnce(new Error('late'))
    await field('movie').setValue('odi')
    resolveFirst([spiderMan])
    await flushPromises()
    expect(wrapper!.findAll('[role="option"]')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(searchAvailableMovies).toHaveBeenCalledTimes(2)
  })

  it('clears the theater and movie when the branch changes', async () => {
    render()
    await fillValidForm()
    await field('branchId').setValue('5')
    expect(field('theaterId').element).toHaveProperty('value', '')
    expect(wrapper!.get<HTMLInputElement>('[readonly]').element.value).toBe('—')
    expect(wrapper!.get('.schedule-summary').text()).toContain('Selecciona una película')
    await vi.advanceTimersByTimeAsync(300)
    expect(searchAvailableMovies).toHaveBeenLastCalledWith(5, spiderMan.title, expect.any(AbortSignal))
  })

  it('shows option and submission states', async () => {
    render({
      optionsLoading: true,
      optionsError: 'No se pudieron cargar las sucursales y salas.',
      submissionErrors: ['La sala ya tiene una proyección asignada en ese horario.'],
      submitting: true,
    })
    expect(wrapper!.text()).toContain('Cargando sucursales y salas…')
    expect(wrapper!.text()).toContain('La sala ya tiene una proyección asignada en ese horario.')
    expect(wrapper!.get('[type="submit"]').text()).toContain('Agregando…')
    await wrapper!.get('.link-button').trigger('click')
    expect(wrapper!.emitted('retryOptions')).toHaveLength(1)
    await wrapper!.get('form').trigger('submit')
    await wrapper!.get('.close-button').trigger('click')
    expect(wrapper!.get('dialog').attributes('open')).toBeDefined()
  })

  it('prefills the default ticket price and lets the administrator change it', async () => {
    render()
    expect(field('price').element).toHaveProperty('value', '')
    await wrapper!.setProps({ defaultPrice: 3500 })
    expect(field('price').element).toHaveProperty('value', '3500')
    expect(wrapper!.get(`[id$="-price-hint"]`).text()).toContain('Precio por defecto: ₡3500')

    await field('price').setValue('4200')
    await wrapper!.setProps({ defaultPrice: 3600 })
    expect(field('price').element).toHaveProperty('value', '4200')

    wrapper!.vm.complete()
    await flushPromises()
    expect(field('price').element).toHaveProperty('value', '3600')
  })

  it('falls back to the placeholder poster and resets after completing', async () => {
    render()
    await fillValidForm()
    await wrapper!.get('img').trigger('error')
    expect(wrapper!.get('img').attributes('src')).not.toContain('spiderman.jpg')

    wrapper!.vm.complete()
    await flushPromises()
    expect(wrapper!.get('dialog').attributes('open')).toBeUndefined()
    expect(field('branchId').element).toHaveProperty('value', '')
    expect(field('cleaningMinutes').element).toHaveProperty('value', '30')

    wrapper!.vm.open()
    wrapper!.vm.open()
    await wrapper!.get('dialog').trigger('cancel')
    expect(wrapper!.get('dialog').attributes('open')).toBeUndefined()
  })
})
