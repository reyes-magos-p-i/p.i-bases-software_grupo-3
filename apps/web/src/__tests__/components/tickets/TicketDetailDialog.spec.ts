import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TicketDetailDialog from '@/components/tickets/TicketDetailDialog.vue'
import type { TicketDetail } from '@/types/ticket'

const ticket: TicketDetail = {
  id: 1234,
  title: 'Dune',
  theaterId: 7,
  startTime: '2026/10/10 18:00',
  endTime: '2026/10/10 20:00',
  seat: 'C5',
}

describe('TicketDetailDialog', () => {
  beforeEach(() => {
    const prototype = HTMLDialogElement.prototype
    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '')
      }),
    })
    Object.defineProperty(prototype, 'close', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  })

  it('shows the ticket details and closes on request', async () => {
    const wrapper = mount(TicketDetailDialog, { props: { ticket } })

    expect(wrapper.text()).toContain('Dune')
    expect(wrapper.text()).toContain('C5')
    expect(wrapper.text()).toContain('10/10/2026, 18:00')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.get('.dialog-actions button').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('shows an error message when the ticket cannot be shown', () => {
    const wrapper = mount(TicketDetailDialog, {
      props: { ticket: null, error: 'No se pudo mostrar el detalle del ticket.' },
    })

    expect(wrapper.get('[role="alert"]').text()).toBe('No se pudo mostrar el detalle del ticket.')
    expect(wrapper.text()).not.toContain('Asiento')
  })
})
