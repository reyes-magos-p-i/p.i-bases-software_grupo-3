import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import GuestBuyerStep from '@/components/purchases/GuestBuyerStep.vue'
let wrapper: VueWrapper
const render = () =>
  (wrapper = mount(GuestBuyerStep, {
    props: { buyer: null, disabled: false, error: '', loginRequired: false },
    attachTo: document.body,
  }))
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})
describe('Guest buyer identification', () => {
  it('validates only on blur or submission and normalizes matching emails', async () => {
    render()
    await wrapper.get('#guest-email').setValue('unfinished')
    expect(wrapper.find('.field-error').exists()).toBe(false)
    await wrapper.get('#guest-email').trigger('blur')
    expect(wrapper.text()).toContain('correo electrónico válido')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Confirma tu correo')
    expect(wrapper.emitted('continue')).toBeUndefined()
    await wrapper.get('#guest-email').setValue(' Guest@Example.com ')
    await wrapper.get('#guest-confirm-email').setValue('other@example.com')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('deben coincidir')
    await wrapper.get('#guest-confirm-email').setValue('GUEST@example.com')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('continue')).toEqual([
      [{ email: 'guest@example.com', confirmEmail: 'guest@example.com' }],
    ])
  })
  it('allows going back on the first click without showing a blur validation', async () => {
    render()
    const input = wrapper.get<HTMLInputElement>('#guest-email')
    await input.setValue('unfinished')
    input.element.focus()
    const back = wrapper.get<HTMLButtonElement>('button[type="button"]')
    back.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    back.element.focus()
    await back.trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.find('.field-error').exists()).toBe(false)
  })
  it('offers login for a registered email and prevents duplicate submissions while busy', async () => {
    render()
    await wrapper.setProps({ error: 'Ya existe una cuenta con este correo.', loginRequired: true })
    expect(wrapper.get('[role="alert"]').text()).toContain('Ya existe')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Iniciar sesión')!
      .trigger('click')
    expect(wrapper.emitted('login')).toHaveLength(1)
    await wrapper.setProps({ disabled: true })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('continue')).toBeUndefined()
    expect(
      wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true)
  })
  it('restores buyer fields when revisiting the email step', () => {
    wrapper = mount(GuestBuyerStep, {
      props: {
        buyer: { email: 'g@example.com', confirmEmail: 'g@example.com' },
        disabled: false,
        error: '',
        loginRequired: false,
      },
    })
    expect(wrapper.get<HTMLInputElement>('#guest-email').element.value).toBe('g@example.com')
    expect(wrapper.get<HTMLInputElement>('#guest-confirm-email').element.value).toBe(
      'g@example.com',
    )
  })
})
