import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import FloatingPopover from '@/components/common/FloatingPopover.vue'

enableAutoUnmount(afterEach)
const anchors: HTMLButtonElement[] = []
afterEach(() => {
  vi.restoreAllMocks()
  anchors.splice(0).forEach((anchor) => anchor.remove())
})
const body = new DOMWrapper(document.body)
function render(open = true) {
  const anchor = document.createElement('button')
  document.body.append(anchor)
  anchors.push(anchor)
  const view = mount(FloatingPopover, {
    props: { open, anchor, id: 'detail', label: 'Detalle' },
    slots: { default: '<strong>Valor seleccionado</strong>' },
  })
  return { view, anchor }
}

describe('FloatingPopover', () => {
  it('renders outside the parent layout and removes the panel when closed', async () => {
    const { view } = render(false)
    expect(body.find('[role="tooltip"]').exists()).toBe(false)
    await view.setProps({ open: true, surface: 'dark' })
    await flushPromises()
    const panel = body.get('[role="tooltip"]')
    expect(panel.text()).toBe('Valor seleccionado')
    expect(panel.classes()).toContain('surface-theme--dark')
    expect(panel.attributes('id')).toBe('detail')
    expect(view.find('strong').exists()).toBe(false)
    await view.setProps({ open: false })
    expect(body.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('closes on outside pointer presses, Escape and scrolling, but allows panel interaction', async () => {
    const { view, anchor } = render()
    await flushPromises()
    body.get('[role="tooltip"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    body.get('[role="tooltip"]').element.dispatchEvent(new Event('scroll', { bubbles: true }))
    expect(view.emitted('close')).toBeUndefined()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(view.emitted('close')).toHaveLength(1)
    const focus = vi.spyOn(anchor, 'focus')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(view.emitted('close')).toHaveLength(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(view.emitted('close')).toHaveLength(2)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    document.body.dispatchEvent(new Event('scroll', { bubbles: true }))
    expect(view.emitted('close')).toHaveLength(3)
    await view.setProps({ open: false })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new Event('scroll', { bubbles: true }))
    expect(view.emitted('close')).toHaveLength(3)
  })

  it('keeps the panel inside the viewport and repositions above or below its anchor', async () => {
    const { view, anchor } = render()
    await flushPromises()
    const panel = body.get<HTMLElement>('[role="tooltip"]').element
    vi.spyOn(panel, 'offsetWidth', 'get').mockReturnValue(160)
    vi.spyOn(panel, 'offsetHeight', 'get').mockReturnValue(70)
    const bounds = vi.spyOn(anchor, 'getBoundingClientRect')
    bounds.mockReturnValue({ left: 0, top: 200, bottom: 230, width: 20 } as DOMRect)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(panel.style.left).toBe('8px')
    expect(panel.style.top).toBe('122px')
    bounds.mockReturnValue({
      left: window.innerWidth - 10,
      top: 0,
      bottom: 30,
      width: 20,
    } as DOMRect)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(panel.style.left).toBe(`${window.innerWidth - 168}px`)
    expect(panel.style.top).toBe('38px')
    await view.setProps({ anchor: null })
    window.dispatchEvent(new Event('resize'))
    expect(panel.style.top).toBe('38px')
  })

  it('uses the browser top layer, focuses information dialogs and releases its listeners', async () => {
    const show = vi.fn(),
      hide = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show })
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: hide })
    try {
      const { view } = render(false)
      await view.setProps({ open: true, role: 'dialog' })
      await flushPromises()
      const panel = body.get('[role="dialog"]')
      expect(panel.attributes('popover')).toBe('manual')
      expect(document.activeElement).toBe(panel.element)
      expect(show).toHaveBeenCalledTimes(1)
      await view.setProps({ open: false })
      expect(hide).toHaveBeenCalledTimes(1)
      await view.setProps({ open: true })
      await flushPromises()
      expect(show).toHaveBeenCalledTimes(2)
      view.unmount()
      expect(hide).toHaveBeenCalledTimes(2)
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      expect(view.emitted('close')).toBeUndefined()
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'showPopover')
      Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover')
    }
  })
})
