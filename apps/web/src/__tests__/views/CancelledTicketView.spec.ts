import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import CancelledTicketView from '@/views/CancelledTicketView.vue'
import {
  changeTicketShowtime,
  getCancelledTicket,
  requestTicketRefund,
} from '@/services/cancelled-ticket.service'

vi.mock('@/services/cancelled-ticket.service', () => ({
  getCancelledTicket: vi.fn(),
  changeTicketShowtime: vi.fn(),
  requestTicketRefund: vi.fn(),
}))

const detail = {
  ticket: {
    id: 48213,
    movieFunctionId: 9,
    title: 'Dune: Parte Tres',
    branchName: 'Cinetadel San Pedro',
    theaterId: 2,
    startsAt: '2026-11-14T18:30:00-06:00',
    functionStatus: 'CANCELLED',
    seatRow: 5,
    seatColumn: 7,
  },
  alternatives: [
    { movieFunctionId: 21, theaterId: 2, time: '14:00', date: '15 de noviembre, 2026', seatRow: 1, seatColumn: 1 },
  ],
}

let wrapper: VueWrapper | undefined

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cancelled-tickets/:ticketId', name: 'cancelled-ticket', component: CancelledTicketView },
      { path: '/cancelled-tickets/:ticketId/refund', name: 'cancelled-ticket-refund', component: { template: '<div />' } },
      { path: '/cancelled-tickets/:ticketId/changed', name: 'cancelled-ticket-changed', component: { template: '<div />' } },
    ],
  })
  await router.push('/cancelled-tickets/48213')
  wrapper = mount(CancelledTicketView, {
    global: {
      plugins: [router],
      stubs: { AppHeader: true, AppFooter: true, RouterLink: { template: '<a><slot/></a>' } },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('CancelledTicketView', () => {
  it('shows the ticket and the alternatives of a cancelled projection', async () => {
    vi.mocked(getCancelledTicket).mockResolvedValue(detail)
    const { wrapper } = await render()

    expect(getCancelledTicket).toHaveBeenCalledWith(48213, expect.any(AbortSignal))
    expect(wrapper.text()).toContain('Dune: Parte Tres')
    expect(wrapper.text()).toContain('5-7')
    expect(wrapper.find('select').exists()).toBe(true)
    expect(wrapper.text()).toContain('Pedir devolución')
  })

  it('says the link does not work when the ticket cannot be found', async () => {
    vi.mocked(getCancelledTicket).mockRejectedValue(new Error('404'))
    const { wrapper } = await render()

    expect(wrapper.text()).toContain('Este enlace no funciona')
    expect(wrapper.text()).toContain('Lamentamos las molestias')
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('moves the ticket to the chosen showtime and opens the confirmation', async () => {
    vi.mocked(getCancelledTicket).mockResolvedValue(detail)
    vi.mocked(changeTicketShowtime).mockResolvedValue({} as never)
    const { wrapper, router } = await render()
    const push = vi.spyOn(router, 'push')

    await wrapper.findAll('button').find((button) => button.text() === 'Confirmar cambio')!.trigger('click')
    await flushPromises()

    expect(changeTicketShowtime).toHaveBeenCalledWith(48213, 21)
    expect(push).toHaveBeenCalledWith({ name: 'cancelled-ticket-changed', params: { ticketId: 48213 } })
  })

  it('records the refund request and opens the refund page', async () => {
    vi.mocked(getCancelledTicket).mockResolvedValue(detail)
    vi.mocked(requestTicketRefund).mockResolvedValue({} as never)
    const { wrapper, router } = await render()
    const push = vi.spyOn(router, 'push')

    await wrapper.findAll('button').find((button) => button.text() === 'Pedir devolución')!.trigger('click')
    await flushPromises()

    expect(requestTicketRefund).toHaveBeenCalledWith(48213)
    expect(push).toHaveBeenCalledWith({ name: 'cancelled-ticket-refund', params: { ticketId: 48213 } })
  })
})
