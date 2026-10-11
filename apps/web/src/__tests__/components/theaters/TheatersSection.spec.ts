import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import TheatersSection from '@/components/theaters/TheatersSection.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import { getTheaters } from '@/services/theater.service'
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
  branchId: 1,
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
    global: { stubs: { LoadingState: false, CrudTable: false } },
  })
  return wrapper
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
