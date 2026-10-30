import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TheaterDetailDialog from '@/components/theaters/TheaterDetailDialog.vue'
import SeatSelector from '@/components/Seats/SeatSelector.vue'
import type { Theater } from '@/types/theater'

const { getTheaterSeats } = vi.hoisted(() => ({
  getTheaterSeats: vi.fn(),
}))

vi.mock('@/services/theater.service', () => ({
  getTheaterSeats,
}))

const theater: Theater = {
  theaterId: 7,
  cinema: 'Centro',
  numberOfSeats: 80,
  dimensionX: 8,
  dimensionY: 10,
  projectorName: 'IMAX',
  isActive: true,
  status: 'Disponible',
}

const mountOptions = {
  global: {
    stubs: {
      SeatSelector: true,
    },
  },
}

describe('TheaterDetailDialog', () => {
  beforeEach(() => {
    getTheaterSeats.mockReset()
    getTheaterSeats.mockResolvedValue([])

    const prototype = HTMLDialogElement.prototype
    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(prototype, 'close', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  })

  it('shows the theater details and loads its seat selector', async () => {
    const seats = [
      {
        theaterId: 7,
        rowNumber: 1,
        columnNumber: 1,
        type: 'normal',
        state: 'free',
      },
    ]
    getTheaterSeats.mockResolvedValueOnce(seats)

    const wrapper = mount(TheaterDetailDialog, {
      ...mountOptions,
      props: { theater },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Centro')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    expect(getTheaterSeats).toHaveBeenCalledWith(
      7,
      expect.any(AbortSignal),
    )

    expect(wrapper.getComponent(SeatSelector).props()).toMatchObject({
      theaterId: 7,
      rows: 8,
      columns: 10,
      seats,
      maxSelections: 'all',
    })
  })

  it('shows an error message when the theater cannot be shown', () => {
    const wrapper = mount(TheaterDetailDialog, {
      ...mountOptions,
      props: {
        theater: null,
        error: 'No se pudo mostrar el detalle de la sala.',
      },
    })

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'No se pudo mostrar el detalle de la sala.',
    )
    expect(wrapper.text()).not.toContain('Número de asientos')
    expect(getTheaterSeats).not.toHaveBeenCalled()
  })

  it('shows an error when loading seats fails', async () => {
    getTheaterSeats.mockRejectedValueOnce(new Error('Request failed'))

    const wrapper = mount(TheaterDetailDialog, {
      ...mountOptions,
      props: { theater },
    })

    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'No se pudieron cargar los asientos.',
    )
    expect(wrapper.findComponent(SeatSelector).exists()).toBe(false)
  })
})
