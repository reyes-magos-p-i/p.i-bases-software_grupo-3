import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TheaterDetailDialog from '@/components/theaters/TheaterDetailDialog.vue'
import type { Theater } from '@/types/theater'

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

describe('TheaterDetailDialog', () => {
  beforeEach(() => {
    const prototype = HTMLDialogElement.prototype
    Object.defineProperty(prototype, 'showModal', { configurable: true, value: vi.fn() })
    Object.defineProperty(prototype, 'close', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  })

  it('shows the theater details', () => {
    const wrapper = mount(TheaterDetailDialog, { props: { theater } })

    expect(wrapper.text()).toContain('Centro')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows an error message when the theater cannot be shown', () => {
    const wrapper = mount(TheaterDetailDialog, {
      props: { theater: null, error: 'No se pudo mostrar el detalle de la sala.' },
    })

    expect(wrapper.get('[role="alert"]').text()).toBe('No se pudo mostrar el detalle de la sala.')
    expect(wrapper.text()).not.toContain('Número de asientos')
  })
})
