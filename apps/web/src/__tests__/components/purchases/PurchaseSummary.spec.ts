import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
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
  it('shows the confirmed buyer email in a quote without generating a consultation credential or QR', () => {
    const wrapper = mount(PurchaseSummary, {
      props: { purchase: quote, buyerEmail: 'guest@example.com' },
    })
    expect(wrapper.text()).toContain('Correo del comprador')
    expect(wrapper.text()).toContain('guest@example.com')
    expect(wrapper.findComponent(QrCode).exists()).toBe(false)
    wrapper.unmount()
  })
  it('shows final prices and a non-navigable purchase QR only after registration', async () => {
    const wrapper = mount(PurchaseSummary, {
      props: { purchase: quote },
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
      buyerEmail: 'ana@example.com',
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
    expect(wrapper.text()).toContain('ana@example.com')
    expect(wrapper.text()).toContain('ORD-000012')
    const code = wrapper.getComponent(QrCode).props('value')
    expect(JSON.parse(code)).toEqual({
      type: 'CINETADEL_PURCHASE',
      version: 1,
      reference: 'ORD-000012',
    })
    expect(code).not.toMatch(/https?:|\/account\/|ana@example\.com/u)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Escanea para consultar')
    expect(wrapper.get('figcaption').text()).toBe('Código de tu compra.')
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
    expect(wrapper.getComponent(QrCode).props('value')).toBe(code)
    await wrapper.setProps({ purchase: { ...receipt, id: 13, reference: 'ORD-000013' } })
    expect(JSON.parse(wrapper.getComponent(QrCode).props('value')).reference).toBe('ORD-000013')
    await wrapper.setProps({ purchase: quote })
    expect(wrapper.findComponent(QrCode).exists()).toBe(false)
    wrapper.unmount()
  })
  it('shows the payment method only when it is asked to', () => {
    const purchase = {
      reference: 'ORD-000121',
      purchasedAt: '2026-10-05T10:42:00-06:00',
      status: 'PAID',
      paymentMethod: 'CARD',
      cardBrand: 'visa',
      cardLast4: '4242',
      total: 7000,
      function: {
        title: 'Ecos del Volcán',
        branchName: 'Central',
        theaterId: 1,
        startsAt: '2026-10-05T20:00:00-06:00',
        format: '2D',
        technology: 'STANDARD',
        isPremiere: false,
      },
      lines: [],
      tickets: [],
    } as never
    const payment = 'Método de pago: Tarjeta Visa terminada en 4242'
    const hidden = mount(PurchaseSummary, { props: { purchase } })
    expect(hidden.text()).not.toContain('Método de pago')
    hidden.unmount()
    const shown = mount(PurchaseSummary, { props: { purchase, showPayment: true } })
    expect(shown.text()).toContain(payment)
    shown.unmount()
  })
})
