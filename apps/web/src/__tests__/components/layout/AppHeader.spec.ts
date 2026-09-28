import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import LoginModal from '@/components/auth/LoginModal.vue'
import RegisterModal from '@/components/auth/RegisterModal.vue'

vi.mock('@/services/authService', () => ({ registerUser: vi.fn() }))

describe('AppHeader authentication navigation', () => {
  let wrapper: VueWrapper
  const page = new DOMWrapper(document.body)
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
    wrapper = mount(AppHeader, {
      attachTo: document.body,
      global: {
        stubs: {
          RouterLink: { template: '<a href="/"><slot /></a>' },
        },
      },
    })
  })

  afterEach(() => {
    wrapper.unmount()
    document.body.innerHTML = ''
    for (const [key, descriptor] of [
      ['showModal', originalShow],
      ['close', originalClose],
    ] as const) {
      if (descriptor) Object.defineProperty(prototype, key, descriptor)
      else Reflect.deleteProperty(prototype, key)
    }
    vi.restoreAllMocks()
  })

  it('navigates from the portal through both login modes and restores focus on close', async () => {
    const opener = wrapper.get<HTMLButtonElement>('.login-button')
    opener.element.focus()
    await opener.trigger('click')
    const login = wrapper.getComponent(LoginModal)
    const originalDialog = page.get('dialog[open]').element
    expect(page.findAll('dialog[open]')).toHaveLength(1)
    expect(page.text()).toContain('Iniciar sesión con Google')
    await page.get('[name="password"]').setValue('temporary-secret')
    await page.get('.switch-mode').trigger('click')
    await nextTick()
    expect(page.get('h2').text()).toBe('Inicio de sesión del personal')
    expect(page.get<HTMLInputElement>('[name="password"]').element.value).toBe('')
    expect(page.find('.bi-google').exists()).toBe(false)
    expect(document.activeElement).toBe(page.get('[name="email"]').element)
    expect(page.findAll('dialog[open]')).toHaveLength(1)
    expect(page.get('dialog[open]').element).toBe(originalDialog)
    expect(login.props('mode')).toBe('employee')
    await page.get('.switch-mode').trigger('click')
    expect(page.get('h2').text()).toBe('Iniciar sesión')
    await page.get('.app-modal-close').trigger('click')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    expect(document.activeElement).toBe(opener.element)
    expect(document.body.style.position).toBe('')
  })

  it('resets to client login on reopening and closes through native Escape', async () => {
    await wrapper.get('.login-button').trigger('click')
    await page.get('.switch-mode').trigger('click')
    await page.get('dialog[open]').trigger('cancel')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    await wrapper.get('.login-button').trigger('click')
    expect(page.get('h2').text()).toBe('Iniciar sesión')
  })

  it('keeps registration available and never displays it with the login dialog', async () => {
    await wrapper.get('.register-button').trigger('click')
    expect(wrapper.getComponent(RegisterModal).props('open')).toBe(true)
    expect(wrapper.getComponent(LoginModal).props('open')).toBe(false)
    expect(page.findAll('dialog[open]')).toHaveLength(1)
    await page.get('.app-modal-close').trigger('click')
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    await wrapper.get('.register-button').trigger('click')
    wrapper.getComponent(RegisterModal).vm.$emit('registered')
    await nextTick()
    expect(page.findAll('dialog[open]')).toHaveLength(0)
    await wrapper.get('.login-button').trigger('click')
    expect(wrapper.getComponent(RegisterModal).props('open')).toBe(false)
    expect(page.findAll('dialog[open]')).toHaveLength(1)
  })
})
