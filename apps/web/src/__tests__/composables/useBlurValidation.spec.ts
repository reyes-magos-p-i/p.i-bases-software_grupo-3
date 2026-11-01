import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useBlurValidation } from '@/composables/useBlurValidation'

describe('useBlurValidation', () => {
  const wrappers: VueWrapper[] = []
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function render() {
    let shouldValidate!: ReturnType<typeof useBlurValidation>
    const wrapper = mount(
      {
        setup() {
          shouldValidate = useBlurValidation()
          return {}
        },
        template: `<section>
        <input id="calendar" readonly aria-haspopup="dialog" /><input id="field" /><input id="next" /><span id="text">Texto</span>
        <button id="cancel" type="button"><i id="icon"></i>Cancelar</button>
        <a id="link" href="/">Salir</a><span id="action" role="button" tabindex="0">Abrir</span>
        <details><summary id="summary">Opciones</summary></details>
        <select id="select"><option>Opción</option></select>
        <input id="submit" type="submit" /><input id="button" type="button" />
        <input id="reset" type="reset" /><input id="check" type="checkbox" /><input id="radio" type="radio" />
        <dialog id="backdrop"></dialog>
      </section>`,
      },
      { attachTo: document.body },
    )
    wrappers.push(wrapper)
    return { wrapper, shouldValidate, field: wrapper.get<HTMLInputElement>('#field') }
  }
  const blur = (relatedTarget: EventTarget | null = null) =>
    new FocusEvent('blur', { relatedTarget })
  const pointer = (target: Element, type: string, button = 0, pointerType = 'mouse') => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, button, pointerType })
    target.dispatchEvent(event)
    return event
  }

  it('allows ordinary blur validation including moving between editable fields', () => {
    const { wrapper, shouldValidate } = render()
    expect(shouldValidate(blur())).toBe(true)
    expect(shouldValidate(blur(wrapper.get('#next').element))).toBe(true)
    expect(shouldValidate(blur(wrapper.get('#text').element))).toBe(true)
  })

  it.each([
    'cancel',
    'icon',
    'link',
    'action',
    'calendar',
    'summary',
    'select',
    'submit',
    'button',
    'reset',
    'check',
    'radio',
    'backdrop',
  ])('preserves keyboard actions when focus moves to %s', (id) => {
    const { wrapper, shouldValidate } = render()
    expect(shouldValidate(blur(wrapper.get(`#${id}`).element))).toBe(false)
  })

  it.each(['mouse', 'touch', 'pen'])(
    'tracks %s action intent before blur even without a related target',
    (pointerType) => {
      const { wrapper, shouldValidate } = render()
      const button = wrapper.get('#icon').element
      const down = pointer(button, 'pointerdown', 0, pointerType)
      expect(down.defaultPrevented).toBe(false)
      expect(shouldValidate(blur())).toBe(false)
      pointer(button, 'pointerup', 0, pointerType)
      expect(shouldValidate(blur())).toBe(false)
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(shouldValidate(blur())).toBe(true)
    },
  )

  it('clears a cancelled gesture before the next field blur', () => {
    const { wrapper, shouldValidate } = render()
    const button = wrapper.get('#cancel').element
    pointer(button, 'pointerdown')
    pointer(button, 'pointercancel')
    expect(shouldValidate(blur())).toBe(true)
  })

  it('does not suppress validation for ordinary field clicks or secondary mouse buttons', () => {
    const { wrapper, shouldValidate, field } = render()
    pointer(wrapper.get('#cancel').element, 'pointerdown')
    pointer(field.element, 'pointerdown')
    pointer(field.element, 'pointerup')
    expect(shouldValidate(blur())).toBe(true)
    pointer(wrapper.get('#cancel').element, 'pointerdown', 2)
    expect(shouldValidate(blur())).toBe(true)
  })

  it('releases pointer intent when no click follows pointerup', () => {
    vi.useFakeTimers()
    const { wrapper, shouldValidate } = render()
    const button = wrapper.get('#cancel').element
    pointer(button, 'pointerdown')
    pointer(button, 'pointerup')
    expect(shouldValidate(blur())).toBe(false)
    vi.runAllTimers()
    expect(shouldValidate(blur())).toBe(true)
  })

  it('clears pointer state when keyboard navigation or window blur takes over', () => {
    const { wrapper, shouldValidate } = render()
    const button = wrapper.get('#cancel').element
    pointer(button, 'pointerdown')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(shouldValidate(blur())).toBe(true)
    pointer(button, 'pointerdown')
    window.dispatchEvent(new Event('blur'))
    expect(shouldValidate(blur())).toBe(true)
  })

  it('removes listeners and pending work on unmount', () => {
    vi.useFakeTimers()
    const remove = vi.spyOn(document, 'removeEventListener')
    const { wrapper, shouldValidate } = render()
    const button = wrapper.get('#cancel').element
    pointer(button, 'pointerdown')
    pointer(button, 'pointerup')
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(vi.getTimerCount()).toBe(0)
    for (const event of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'keydown']) {
      expect(remove).toHaveBeenCalledWith(event, expect.any(Function), true)
    }
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(shouldValidate(blur())).toBe(true)
  })
})
