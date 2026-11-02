import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PurchaseEmailStatus from '@/components/purchases/PurchaseEmailStatus.vue'
import type { TicketEmailStatus } from '@/types/purchase'

describe('PurchaseEmailStatus', () => {
  const props = {
    status: null as TicketEmailStatus | null,
    busy: false,
    checking: false,
    seconds: 0,
    error: '',
  }
  const state = (status: TicketEmailStatus['status']): TicketEmailStatus => ({
    status,
    recipient: 'client@example.com',
    sentAt: null,
    retryAfter: 0,
  })
  it('shows a pending state without claiming successful delivery', async () => {
    const wrapper = mount(PurchaseEmailStatus, { props })
    expect(wrapper.text()).toContain('preparando')
    expect(wrapper.text()).not.toContain('Enviamos tus boletos')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('check')).toHaveLength(1)
    await wrapper.setProps({ status: state('SENDING'), checking: true })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Comprobando')
    wrapper.unmount()
  })
  it('shows acceptance and enables a resend only after its cooldown', async () => {
    const wrapper = mount(PurchaseEmailStatus, {
      props: { ...props, status: state('SENT'), seconds: 30 },
    })
    expect(wrapper.text()).toContain('Enviamos tus boletos a client@example.com')
    expect(wrapper.text()).toContain('30 s')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ seconds: 0 })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('resend')).toHaveLength(1)
    await wrapper.setProps({ busy: true })
    expect(wrapper.get('button').text()).toContain('Solicitando')
    wrapper.unmount()
  })
  it.each([
    ['FAILED', 'No se pudieron enviar'],
    ['UNKNOWN', 'Revisa tu correo'],
    ['NOT_REQUESTED', 'Puedes enviar'],
  ] as const)('explains %s and offers an explicit send', (status, message) => {
    const wrapper = mount(PurchaseEmailStatus, { props: { ...props, status: state(status) } })
    expect(wrapper.text()).toContain(message)
    expect(wrapper.get('button').text()).toContain(
      status === 'NOT_REQUESTED' ? 'Enviar boletos' : 'Reenviar boletos',
    )
    wrapper.unmount()
  })
  it('offers a status check after a read failure without discarding receipt access', async () => {
    const wrapper = mount(PurchaseEmailStatus, {
      props: { ...props, status: state('PENDING'), error: 'No se pudo comprobar' },
    })
    expect(wrapper.text()).toContain('No se pudo comprobar')
    expect(wrapper.findAll('button')).toHaveLength(1)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('check')).toHaveLength(1)
    wrapper.unmount()
  })
})
