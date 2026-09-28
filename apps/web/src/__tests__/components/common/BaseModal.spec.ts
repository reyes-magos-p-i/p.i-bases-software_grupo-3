import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'

describe('BaseModal', () => {
  const wrappers: VueWrapper[] = []
  const page = new DOMWrapper(document.body)
  const prototype = HTMLDialogElement.prototype
  const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
  let opener: HTMLButtonElement

  beforeEach(() => {
    Object.defineProperties(prototype, {
      showModal: {
        configurable: true,
        value: vi.fn(function (this: HTMLDialogElement) {
          this.open = true
        }),
      },
      close: {
        configurable: true,
        value: vi.fn(function (this: HTMLDialogElement) {
          this.open = false
        }),
      },
    })
    opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    for (const [key, descriptor] of [
      ['showModal', originalShow],
      ['close', originalClose],
    ] as const) {
      if (descriptor) Object.defineProperty(prototype, key, descriptor)
      else Reflect.deleteProperty(prototype, key)
    }
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
    document.documentElement.removeAttribute('style')
    vi.restoreAllMocks()
  })

  async function render(
    open = true,
    slot = '<input aria-label="Correo" /><button>Enviar</button>',
  ) {
    const wrapper = mount(BaseModal, {
      props: { open, title: 'Modal' },
      attachTo: document.body,
      slots: { default: slot },
    })
    wrappers.push(wrapper)
    await nextTick()
    return wrapper
  }

  it('keeps closed content hidden without locking the page or responding to Escape', async () => {
    const wrapper = await render(false)
    expect(page.find('.app-modal-card').exists()).toBe(false)
    expect(page.get('dialog').element.open).toBe(false)
    expect(document.body.style.position).toBe('')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('opens in the native modal layer, names the dialog and focuses the first field', async () => {
    await render()
    expect(prototype.showModal).toHaveBeenCalledOnce()
    expect(page.get('dialog').element.open).toBe(true)
    expect(page.get('h2').attributes('id')).toBe(page.get('dialog').attributes('aria-labelledby'))
    expect(document.activeElement).toBe(page.get('input').element)
    expect(document.body.style.position).toBe('fixed')
    expect(document.documentElement.style.overflow).toBe('hidden')
  })

  it('uses distinct accessible title identifiers', async () => {
    const parent = mount({
      components: { BaseModal },
      template: '<BaseModal :open="false" title="One" /><BaseModal :open="false" title="Two" />',
    })
    wrappers.push(parent)
    const dialogs = page.findAll('dialog')
    expect(dialogs[0]!.attributes('aria-labelledby')).not.toBe(
      dialogs[1]!.attributes('aria-labelledby'),
    )
  })

  it('focuses the close button when the slot has no fields', async () => {
    await render(true, '<p>Information</p>')
    expect(document.activeElement).toBe(page.get('.app-modal-close').element)
  })

  it('emits close on the button, backdrop and native Escape cancellation, not content clicks', async () => {
    const wrapper = await render()
    await page.get('.app-modal-card').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    await page.get('.app-modal-close').trigger('click')
    await page.get('dialog').trigger('click')
    const event = new Event('cancel', { cancelable: true })
    page.get('dialog').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.emitted('close')).toHaveLength(3)
    await wrapper.setProps({ open: false })
    expect(page.get('dialog').element.open).toBe(false)
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.position).toBe('')
  })

  it('restores styles, priorities and scroll position on unmount', async () => {
    document.documentElement.style.setProperty('overflow', 'scroll', 'important')
    document.body.style.setProperty('position', 'relative')
    const x = vi.spyOn(window, 'scrollX', 'get').mockReturnValue(20)
    const y = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(80)
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const wrapper = await render()
    expect(document.body.style.top).toBe('-80px')
    x.mockReturnValue(0)
    y.mockReturnValue(0)
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(document.documentElement.style.overflow).toBe('scroll')
    expect(document.documentElement.style.getPropertyPriority('overflow')).toBe('important')
    expect(document.body.style.position).toBe('relative')
    expect(document.body.style.top).toBe('')
    expect(scroll).toHaveBeenCalledWith({ left: 20, top: 80, behavior: 'instant' })
    expect(document.activeElement).toBe(opener)
  })

  it('can reopen and tolerates removal of its opener', async () => {
    const wrapper = await render(false)
    await wrapper.setProps({ open: true })
    await wrapper.setProps({ title: 'Another title' })
    expect(page.get('dialog').element.open).toBe(true)
    expect(prototype.showModal).toHaveBeenCalledOnce()
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    opener.remove()
    await wrapper.setProps({ open: false })
    expect(document.body.style.position).toBe('')
  })
})
