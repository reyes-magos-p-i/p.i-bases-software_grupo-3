import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { loadStripe } from '@stripe/stripe-js'
import CardPaymentStep from '@/components/purchases/CardPaymentStep.vue'

vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn() }))

const intent = {
  intentId: 'pi_1',
  clientSecret: 'pi_1_secret',
  publishableKey: 'pk_test',
}

describe('CardPaymentStep', () => {
  const confirmPayment = vi.fn()
  const paymentElement = {
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'ready') handler()
    }),
    mount: vi.fn(),
    destroy: vi.fn(),
  }
  const stripe = {
    elements: vi.fn(() => ({ create: vi.fn(() => paymentElement) })),
    confirmPayment,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    paymentElement.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'ready') handler()
    })
    vi.mocked(loadStripe).mockResolvedValue(stripe as never)
  })

  async function mounted() {
    const wrapper = mount(CardPaymentStep, { props: { intent } })
    await flushPromises()
    return wrapper
  }

  it('reports the approved intent only after Stripe confirms the payment', async () => {
    confirmPayment.mockResolvedValue({ paymentIntent: { id: 'pi_1', status: 'succeeded' } })
    const wrapper = await mounted()

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Pagar')!
      .trigger('click')
    await flushPromises()

    expect(loadStripe).toHaveBeenCalledWith('pk_test')
    expect(stripe.elements).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'pi_1_secret' }),
    )
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ redirect: 'if_required' }),
    )
    expect(wrapper.emitted('paid')).toEqual([['pi_1']])
  })

  it('explains insufficient funds without reporting a payment', async () => {
    confirmPayment.mockResolvedValue({
      error: { type: 'card_error', code: 'card_declined', decline_code: 'insufficient_funds' },
    })
    const wrapper = await mounted()

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Pagar')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Fondos insuficientes')
    expect(wrapper.emitted('paid')).toBeUndefined()
  })

  it('explains an invalid card without reporting a payment', async () => {
    confirmPayment.mockResolvedValue({
      error: { type: 'card_error', code: 'incorrect_number' },
    })
    const wrapper = await mounted()

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Pagar')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('no es válida')
    expect(wrapper.emitted('paid')).toBeUndefined()
  })

  it('cancels locally without asking Stripe to confirm anything', async () => {
    const wrapper = await mounted()

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancelar')!
      .trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(confirmPayment).not.toHaveBeenCalled()
  })

  it('shows a retryable error when Stripe.js cannot load', async () => {
    vi.mocked(loadStripe).mockResolvedValue(null)
    const wrapper = await mounted()

    expect(wrapper.get('[role="alert"]').text()).toContain('No se pudo cargar')
    expect(wrapper.find('button[disabled]').exists()).toBe(true)
  })
})
