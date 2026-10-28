import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import TicketDetailDialog from '@/components/tickets/TicketDetailDialog.vue'
import TicketsSection from '@/components/tickets/TicketsSection.vue'

const { getTicket } = vi.hoisted(() => ({ getTicket: vi.fn() }))

vi.mock('@/services/ticket.service', () => ({ getTicket }))
vi.mock('@/composables/useEmployeeSessionRecovery', () => ({
  useEmployeeSessionRecovery: () => ({
    sessionExpired: vi.fn(),
    refreshPermissions: vi.fn(),
  }),
}))

const ticket = {
  title: 'Dune',
  theaterId: 3,
  startTime: '2026/10/10 18:00',
  endTime: '2026/10/10 20:30',
  seat: '1-2',
}

async function search(wrapper: ReturnType<typeof mount>, value: string) {
  await wrapper.get('#ticket-number').setValue(value)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('TicketsSection', () => {
  beforeEach(() => {
    getTicket.mockReset()
    const prototype = HTMLDialogElement.prototype
    Object.defineProperty(prototype, 'showModal', { configurable: true, value: vi.fn() })
    Object.defineProperty(prototype, 'close', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  })

  it('shows the searched ticket in the results table', async () => {
    getTicket.mockResolvedValue(ticket)
    const wrapper = mount(TicketsSection)

    await search(wrapper, '1001')

    expect(getTicket).toHaveBeenCalledWith(1001, expect.any(AbortSignal))
    const cells = wrapper.findAll('tbody td').map((cell) => cell.text())
    expect(cells.slice(0, 6)).toEqual([
      '1001',
      'Dune',
      '3',
      '10/10/2026, 18:00',
      '10/10/2026, 20:30',
      '1-2',
    ])
    expect(
      wrapper.findAll('tbody td [aria-label]').map((button) => button.attributes('aria-label')),
    ).toEqual(['Ver detalle', 'Modificar'])
  })

  it('opens the ticket detail dialog from the "Ver detalle" button', async () => {
    getTicket.mockResolvedValue(ticket)
    const wrapper = mount(TicketsSection)

    await search(wrapper, '1001')
    expect(wrapper.findComponent(TicketDetailDialog).props('ticket')).toBeNull()

    await wrapper.get('button[aria-label="Ver detalle"]').trigger('click')

    expect(wrapper.findComponent(TicketDetailDialog).props('ticket')).toMatchObject({
      id: 1001,
      title: 'Dune',
      seat: '1-2',
    })
  })

  it('reports when no ticket matches the number', async () => {
    getTicket.mockResolvedValue('')
    const wrapper = mount(TicketsSection)

    await search(wrapper, '999')

    expect(wrapper.findComponent(NotificationPopup).props('message')).toBe('El ticket no existe')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('rejects a ticket number that is not a positive integer without calling the API', async () => {
    const wrapper = mount(TicketsSection)

    await search(wrapper, 'abc')

    expect(getTicket).not.toHaveBeenCalled()
    expect(wrapper.findComponent(NotificationPopup).props('message')).toBe(
      'Ingresa un número de ticket válido.',
    )
  })

  it('replaces the not-found notification when the next search is invalid', async () => {
    getTicket.mockResolvedValue('')
    const wrapper = mount(TicketsSection)

    await search(wrapper, '999')
    expect(wrapper.findComponent(NotificationPopup).props('message')).toBe('El ticket no existe')

    await search(wrapper, '0')

    expect(getTicket).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(NotificationPopup).props('message')).toBe(
      'Ingresa un número de ticket válido.',
    )
  })
})
