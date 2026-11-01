import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import QrCode from '@/components/common/QrCode.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import type { PurchaseQuote, PurchaseReceipt } from '@/types/purchase'
const quote = {
  function: {
    id: 4,
    title: 'Película',
    branchName: 'Central',
    theaterId: 3,
    startsAt: '2099-01-01T20:00:00-06:00',
    format: '3D',
    technology: 'IMAX',
    isPremiere: true,
  },
  seats: [{ rowNumber: 1, columnNumber: 2, category: 'CHILD' }],
  lines: [
    {
      code: 'TICKET_CHILD_VIP',
      label: 'Niño · VIP',
      quantity: 1,
      base: 2500,
      modifiers: [{ label: 'VIP', amount: 1000 }],
      unitPrice: 3500,
      subtotal: 3500,
    },
  ],
  total: 3500,
  quantity: 1,
  version: 'hash',
} as PurchaseQuote
describe('PurchaseSummary', () => {
  it('shows final prices and generates a private QR only after the purchase is registered', async () => {
    const router = createRouter({
      history: createMemoryHistory('/cinema/'),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/account/profile', component: { template: '<div />' } },
      ],
    })
    const wrapper = mount(PurchaseSummary, {
      props: { purchase: quote },
      global: { plugins: [router] },
    })
    expect(wrapper.text()).toContain('Fila 1, asiento 2 (Niño)')
    expect(wrapper.text()).not.toContain('Base ₡2500')
    expect(wrapper.text()).not.toContain('VIP ₡1000')
    expect(wrapper.text()).toContain('Niño · VIP')
    expect(wrapper.findComponent(QrCode).exists()).toBe(false)
    expect(wrapper.text()).toContain('Total: ₡3500')
    const receipt = {
      ...quote,
      id: 12,
      reference: 'ORD-000012',
      purchasedAt: '2099-01-01T12:00:00-06:00',
      status: 'PAID',
      tickets: [
        {
          id: 10,
          functionId: 5,
          title: 'Nueva película',
          theaterId: 6,
          startsAt: '2099-01-02T20:00:00-06:00',
          functionStatus: 'ACTIVE',
          rowNumber: 2,
          columnNumber: 3,
          category: 'CHILD',
        },
      ],
    } as unknown as PurchaseReceipt
    await wrapper.setProps({ purchase: receipt })
    expect(wrapper.text()).toContain('ORD-000012')
    expect(wrapper.getComponent(QrCode).props('value')).toBe(
      `${window.location.origin}/cinema/account/profile?section=purchases&purchaseId=12`,
    )
    expect(wrapper.getComponent(QrCode).props('label')).toBe('Código QR de la compra ORD-000012')
    expect(wrapper.find('svg[role="img"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Boleto 10')
    expect(wrapper.text()).toContain('Reprogramado: Nueva película')
    await wrapper.setProps({
      purchase: {
        ...receipt,
        tickets: [],
        status: 'CANCELLED',
        function: { ...receipt.function, technology: 'STANDARD', isPremiere: false },
        lines: [{ ...receipt.lines[0]!, modifiers: [] }],
      },
    })
    expect(wrapper.text()).toContain('Cancelada')
    expect(wrapper.text()).toContain('histórica no tiene boletos vinculados')
    wrapper.unmount()
    router.options.history.destroy()
  })
})
