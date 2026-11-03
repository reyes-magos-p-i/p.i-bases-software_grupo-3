import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import TheatersSection from '@/components/theaters/TheatersSection.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import {
  createTheater,
  updateTheater,
  getTheaterCreationOptions,
  getTheaters,
} from '@/services/theater.service'
import CreateTheaterDialog from '@/components/theaters/CreateTheaterDialog.vue'
import ModifyTheaterDialog from '@/components/theaters/ModifyTheaterDialog.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import type { Theater } from '@/types/theater'

vi.mock('@/services/theater.service', () => ({
  getTheaters: vi.fn(),
  getTheaterCreationOptions: vi.fn(),
  createTheater: vi.fn(),
  updateTheater: vi.fn(),
  deleteTheater: vi.fn(),
}))
vi.mock('@/composables/useEmployeeSessionRecovery', () => ({
  useEmployeeSessionRecovery: () => ({
    state: { disposed: false },
    sessionExpired: vi.fn(),
    refreshPermissions: vi.fn(),
  }),
}))

const theater: Theater = {
  theaterId: 42,
  cinema: 'Cinema Test',
  numberOfSeats: 80,
  dimensionX: 8,
  dimensionY: 10,
  projectorName: 'Proyector digital',
  isActive: true,
  status: 'Disponible',
}
let wrapper: VueWrapper | undefined

function pendingTheaters() {
  let resolve!: (value: Theater[]) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Theater[]>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function render() {
  wrapper = shallowMount(TheatersSection, {
    global: {
      stubs: {
        LoadingState: false,
        CrudTable: false,
        TheaterSearchBar: false,
        TheaterFilters: false,
        TheaterFilterPicker: false,
        CreateTheaterDialog: dialogStub('CreateTheaterDialog'),
        ModifyTheaterDialog: dialogStub('ModifyTheaterDialog'),
      },
    },
  })
  return wrapper
}

function dialogStub(name: string) {
  return defineComponent({
    name,
    props: ['theater', 'submissionErrors'],
    emits: ['submit'],
    setup(_props, { expose }) {
      expose({ open: vi.fn(), complete: vi.fn() })
      return () => h('div')
    },
  })
}

beforeEach(() => {
  vi.mocked(getTheaters).mockReset()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('TheatersSection loading presentation', () => {
  it.each([true, false])(
    'replaces loading with the appropriate result when records exist: %s',
    async (hasRecords) => {
      const request = pendingTheaters()
      vi.mocked(getTheaters).mockReturnValue(request.promise)
      const view = render()

      expect(view.get('[role="status"]').text()).toBe('Cargando salas…')
      expect(view.get('.list-content').attributes('aria-busy')).toBe('true')
      expect(view.findComponent(CrudTable).exists()).toBe(false)
      expect(view.find('.empty-state').exists()).toBe(false)
      request.resolve(hasRecords ? [theater] : [])
      await flushPromises()

      expect(view.findComponent(LoadingState).exists()).toBe(false)
      expect(view.get('.list-content').attributes('aria-busy')).toBe('false')
      expect(view.findComponent(CrudTable).exists()).toBe(hasRecords)
      expect(view.find('.empty-state').exists()).toBe(!hasRecords)
    },
  )

  it('shows an error after loading fails and shows loading again during a retry', async () => {
    const first = pendingTheaters()
    vi.mocked(getTheaters).mockReturnValue(first.promise)
    const view = render()
    first.reject(new Error('Connection unavailable'))
    await flushPromises()

    expect(view.findComponent(LoadingState).exists()).toBe(false)
    expect(view.get('[role="alert"]').text()).toContain('No se pudieron cargar las salas')
    const retry = pendingTheaters()
    vi.mocked(getTheaters).mockReturnValue(retry.promise)
    await view.get('[role="alert"] button').trigger('click')
    expect(view.getComponent(LoadingState).props('message')).toBe('Cargando salas…')
    expect(view.find('[role="alert"]').exists()).toBe(false)
    retry.resolve([theater])
    await flushPromises()

    expect(view.findComponent(LoadingState).exists()).toBe(false)
    expect(view.get('tbody').text()).toContain(theater.projectorName)
    expect(getTheaters).toHaveBeenCalledTimes(2)
  })
})

describe('TheatersSection with a malformed options response', () => {
  it.each([
    ['a non-array statuses field', { projectors: [], cinemas: [], statuses: null }],
    ['a missing statuses field', { projectors: [], cinemas: [] }],
  ])('still renders the list given %s', async (_label, options) => {
    vi.mocked(getTheaters).mockResolvedValue([theater])
    vi.mocked(getTheaterCreationOptions).mockResolvedValue(
      options as unknown as Awaited<ReturnType<typeof getTheaterCreationOptions>>,
    )
    const view = render()
    await flushPromises()

    expect(view.findComponent(CrudTable).exists()).toBe(true)
    expect(view.get('tbody').text()).toContain(theater.projectorName)
    expect(view.find('.filters').exists()).toBe(true)
  })
})

describe('TheatersSection search', () => {
  const theaters = [
    { ...theater, theaterId: 1, cinema: 'Sucursal Cartago', projectorName: 'Proyector láser' },
    { ...theater, theaterId: 2, cinema: 'Sucursal Heredia', projectorName: 'Proyector digital' },
  ] as unknown as Theater[]

  async function renderLoaded() {
    vi.mocked(getTheaters).mockResolvedValue(theaters)
    const view = render()
    await flushPromises()
    return view
  }

  it('filters by text ignoring accents and case', async () => {
    const view = await renderLoaded()
    await view.get('#theater-search').setValue('LASER')

    expect(view.get('tbody').text()).toContain('Cartago')
    expect(view.get('tbody').text()).not.toContain('Heredia')
  })

  it('shows the empty state when nothing matches and restores rows on clear', async () => {
    const view = await renderLoaded()
    await view.get('#theater-search').setValue('zzz')
    expect(view.findComponent(CrudTable).exists()).toBe(false)
    expect(view.get('.empty-state h2').text()).toBe('No se encontraron salas con estos criterios')
    expect(view.get('.empty-state p').text()).toBe('Prueba con otros filtros o límpialos.')
    expect(view.text()).not.toContain('No hay datos')

    await view.get('.filters .secondary-button').trigger('click')
    expect((view.get('#theater-search').element as HTMLInputElement).value).toBe('')
    expect(view.get('tbody').text()).toContain('Heredia')
  })
})

describe('TheatersSection operation feedback', () => {
  beforeEach(() => {
    vi.mocked(getTheaters).mockResolvedValue([theater])
    vi.mocked(getTheaterCreationOptions).mockResolvedValue({
      projectors: [],
      cinemas: [],
      statuses: [],
    })
    vi.mocked(createTheater).mockReset()
    vi.mocked(updateTheater).mockReset()
  })

  it('uses the shared floating notification after creating a theater', async () => {
    vi.mocked(createTheater).mockResolvedValue(theater)
    const view = render()
    await flushPromises()
    view.getComponent(CreateTheaterDialog).vm.$emit('submit', { numberOfSeats: 80 })
    await flushPromises()
    expect(view.getComponent(NotificationPopup).props()).toMatchObject({
      type: 'success',
      placement: 'bottom-right',
      message: 'Sala 42 creada exitosamente.',
    })
    expect(view.findAllComponents(NotificationPopup)).toHaveLength(1)
    expect(view.getComponent(CreateTheaterDialog).vm.complete).toHaveBeenCalledOnce()
    expect(getTheaters).toHaveBeenCalledTimes(2)
  })

  it('keeps the modification open and explains dimensions protected by associated functions', async () => {
    vi.mocked(updateTheater).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409 },
    })
    const view = render()
    await flushPromises()
    await view.get('[aria-label="Modificar sala"]').trigger('click')
    view.getComponent(ModifyTheaterDialog).vm.$emit('submit', { dimensionX: 9 })
    await flushPromises()
    expect(updateTheater).toHaveBeenCalledWith(42, { dimensionX: 9 })
    expect(view.getComponent(ModifyTheaterDialog).props('theater')).toEqual(theater)
    expect(view.getComponent(ModifyTheaterDialog).props('submissionErrors')).toEqual([
      'No puedes cambiar las dimensiones de una sala con funciones asociadas. Sus asientos e historial deben conservarse.',
    ])
    expect(view.findComponent(NotificationPopup).exists()).toBe(false)
  })

  it('reports an uncertain creation with a floating notification and preserves the form', async () => {
    vi.mocked(createTheater).mockRejectedValueOnce(new Error('Network error'))
    const view = render()
    await flushPromises()
    view.getComponent(CreateTheaterDialog).vm.$emit('submit', { numberOfSeats: 80 })
    await flushPromises()
    expect(view.getComponent(NotificationPopup).props()).toMatchObject({
      type: 'error',
      placement: 'bottom-right',
      message:
        'El resultado no pudo ser confirmado. Verifica si la sala fue creada antes de intentarlo de nuevo.',
    })
    expect(view.getComponent(CreateTheaterDialog).props('submissionErrors')).toEqual([])
    expect(getTheaters).toHaveBeenCalledTimes(1)
  })
})
