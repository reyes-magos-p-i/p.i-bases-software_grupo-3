import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ClientEmailChangeDialog from '@/components/clients/ClientEmailChangeDialog.vue'
import BaseModal from '@/components/common/BaseModal.vue'

describe('ClientEmailChangeDialog', () => {
  let native: VueWrapper | undefined
  const prototype = HTMLDialogElement.prototype
  const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
  beforeEach(() => {
    Object.defineProperties(prototype, {
      showModal: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.open = true
        },
      },
      close: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.open = false
        },
      },
    })
  })
  afterEach(() => {
    native?.unmount()
    native = undefined
    for (const [key, descriptor] of [
      ['showModal', originalShow],
      ['close', originalClose],
    ] as const) {
      if (descriptor) Object.defineProperty(prototype, key, descriptor)
      else Reflect.deleteProperty(prototype, key)
    }
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  const options = {
    props: { open: true, currentEmail: 'old@example.com' },
    global: { stubs: { BaseModal: { template: '<section><slot /></section>' } } },
  }
  it('validates on blur or submit and emits the normalized email only after validation', async () => {
    const wrapper = mount(ClientEmailChangeDialog, options)
    await wrapper.get('input').setValue('incomplete')
    expect(wrapper.text()).not.toContain('Escribe un correo electrónico válido')
    await wrapper.get('input').trigger('blur')
    expect(wrapper.text()).toContain('Escribe un correo electrónico válido')
    await wrapper.get('input').setValue(' NEW@Example.com ')
    expect(wrapper.text()).not.toContain('Escribe un correo electrónico válido')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('request')).toEqual([['new@example.com']])
    expect(wrapper.text()).toContain('30 minutos')
    expect(wrapper.text()).toContain('se cerrarán tus sesiones')
    wrapper.unmount()
  })
  it('rejects unchanged or invalid email and permits cancellation', async () => {
    const wrapper = mount(ClientEmailChangeDialog, options)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('request')).toBeUndefined()
    await wrapper.get('input').setValue('OLD@EXAMPLE.COM')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('diferente al actual')
    await wrapper.findAll('button')[0]!.trigger('click')
    wrapper.getComponent(BaseModal).vm.$emit('close')
    expect(wrapper.emitted('close')).toHaveLength(2)
    await wrapper.setProps({ open: false })
    expect(wrapper.get('input').element.value).toBe('')
    wrapper.unmount()
  })
  it('prevents repeat submissions during sending and displays request errors', async () => {
    const wrapper = mount(ClientEmailChangeDialog, {
      ...options,
      props: { ...options.props, pending: true, error: 'Correo reservado' },
    })
    await wrapper.get('input').setValue('new@example.com')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('request')).toBeUndefined()
    expect(wrapper.text()).toContain('Enviando…')
    expect(wrapper.get('[role="alert"]').text()).toBe('Correo reservado')
    wrapper.unmount()
  })
  it.each(['.actions button[type="button"]', '.app-modal-close'])(
    'closes on the first touch of %s without blur reflow',
    async (selector) => {
      native = mount(ClientEmailChangeDialog, {
        props: { open: true, currentEmail: 'old@example.com' },
        attachTo: document.body,
      })
      const page = new DOMWrapper(document.body)
      await nextTick()
      const email = page.get<HTMLInputElement>('input')
      await email.setValue('unfinished')
      email.element.focus()
      const action = page.get<HTMLButtonElement>(selector)
      action.element.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch' }),
      )
      await email.trigger('blur', { relatedTarget: null })
      expect(email.attributes('aria-invalid')).toBe('false')
      expect(page.text()).not.toContain('Escribe un correo electrónico válido')
      await action.trigger('pointerup')
      await action.trigger('click')
      expect(native.emitted('close')).toHaveLength(1)
      expect(native.emitted('request')).toBeUndefined()
      await native.setProps({ open: false })
      expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(false)
    },
  )

  it('allows keyboard closing and still validates an invalid email on submit', async () => {
    native = mount(ClientEmailChangeDialog, {
      props: { open: true, currentEmail: 'old@example.com' },
      attachTo: document.body,
    })
    const page = new DOMWrapper(document.body)
    await nextTick()
    const email = page.get<HTMLInputElement>('input')
    await email.setValue('unfinished')
    email.element.focus()
    const close = page.get<HTMLButtonElement>('.app-modal-close')
    close.element.focus()
    await nextTick()
    expect(email.attributes('aria-invalid')).toBe('false')
    await close.trigger('click')
    expect(native.emitted('close')).toHaveLength(1)
    await page.get('form').trigger('submit')
    expect(email.attributes('aria-invalid')).toBe('true')
    expect(native.emitted('request')).toBeUndefined()
  })
})
