import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DatePicker from '@/components/common/DatePicker.vue'

let wrapper: VueWrapper<InstanceType<typeof DatePicker>>
const popoverDescriptors = new Map(
  ['showPopover', 'hidePopover'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
  ]),
)
function render(props: Partial<InstanceType<typeof DatePicker>['$props']> = {}) {
  wrapper = mount(DatePicker, {
    props,
    attrs: { id: 'birthday', name: 'birthday' },
    attachTo: document.body,
  })
  return wrapper
}
beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-10-19T02:00:00Z')))
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const [name, descriptor] of popoverDescriptors) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, name)
  }
  vi.useRealTimers()
})

describe('DatePicker', () => {
  it('emits blur only when focus leaves the complete calendar', async () => {
    const view = render({ modelValue: '2000-02-29' })
    view.get<HTMLInputElement>('input').element.focus()
    await view.get('input').trigger('click')
    expect(view.emitted('blur')).toBeUndefined()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await nextTick()
    expect(view.emitted('blur')).toHaveLength(1)
    expect(view.find('.calendar-panel').exists()).toBe(false)
  })

  it('emits one change for a new date and no change when selecting the current date again', async () => {
    const view = render({ modelValue: '2000-02-29' })
    const changed = vi.fn()
    view.get('input').element.addEventListener('change', changed)
    await view.get('input').trigger('click')
    await view.get('[data-date="2000-02-28"]').trigger('click')
    await nextTick()
    expect(changed).toHaveBeenCalledTimes(1)
    await view.setProps({ modelValue: '2000-02-28' })
    await view.get('input').trigger('click')
    await view.get('[data-date="2000-02-28"]').trigger('click')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(view.emitted('update:modelValue')).toEqual([['2000-02-28']])
    expect(view.find('.calendar-panel').exists()).toBe(false)
  })

  it('keeps a floating calendar inside the viewport and repositions on scroll and resize', async () => {
    const show = vi.fn()
    const hide = vi.fn()
    Object.defineProperties(HTMLElement.prototype, {
      showPopover: { configurable: true, value: show },
      hidePopover: { configurable: true, value: hide },
    })
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(390)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400)
    const view = render()
    const anchor = vi.spyOn(view.get('input').element, 'getBoundingClientRect')
    anchor.mockReturnValue(new DOMRect(270, 600, 100, 44))
    await view.get('input').trigger('click')
    const calendar = view.get<HTMLElement>('.calendar-panel')
    expect(calendar.attributes('popover')).toBe('manual')
    expect(show).toHaveBeenCalledTimes(1)
    expect(calendar.element.style.left).toBe('82px')
    expect(calendar.element.style.top).toBe('192px')
    anchor.mockReturnValue(new DOMRect(20, 20, 100, 44))
    document.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(calendar.element.style.left).toBe('20px')
    expect(calendar.element.style.top).toBe('72px')
    anchor.mockReturnValue(new DOMRect(-20, 20, 100, 44))
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(calendar.element.style.left).toBe('8px')
    await calendar.get('.calendar-footer button:last-child').trigger('click')
    expect(hide).toHaveBeenCalled()
    expect(view.find('.calendar-panel').exists()).toBe(false)
  })

  it('positions the fallback relative to its field and removes listeners on unmount', async () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover')
    Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover')
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('innerHeight', 844)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400)
    const removed = vi.spyOn(document, 'removeEventListener')
    const resized = vi.spyOn(window, 'removeEventListener')
    const view = render()
    vi.spyOn(view.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(270, 600, 100, 44))
    vi.spyOn(view.get('input').element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(270, 600, 100, 44),
    )
    await view.get('input').trigger('click')
    const calendar = view.get<HTMLElement>('.calendar-panel')
    expect(calendar.attributes('popover')).toBeUndefined()
    expect(calendar.element.style.left).toBe('-188px')
    expect(calendar.element.style.top).toBe('-408px')
    view.unmount()
    expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    expect(resized).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('shows a read-only date, forwards field attributes and emits an ISO date when selecting', async () => {
    const view = render({ modelValue: '2000-02-29' })
    expect(view.get<HTMLInputElement>('input').element.value).toBe('29/02/2000')
    expect(view.get('input').attributes()).toMatchObject({
      id: 'birthday',
      name: 'birthday',
      readonly: '',
    })
    await view.get('input').trigger('click')
    expect(view.get('[role="dialog"]').attributes('id')).toBe(
      view.get('input').attributes('aria-controls'),
    )
    await nextTick()
    expect(document.activeElement).toBe(view.get('[data-date="2000-02-29"]').element)
    await view.get('[data-date="2000-02-28"]').trigger('click')
    expect(view.emitted('update:modelValue')).toEqual([['2000-02-28']])
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(view.get('input').element)
  })
  it('opens on today in Costa Rica, changes month and navigates across years', async () => {
    const view = render()
    expect(view.get<HTMLInputElement>('input').element.value).toBe('')
    await view.get('input').trigger('keydown', { key: 'Enter' })
    expect(view.find('[data-date="2026-10-18"]').exists()).toBe(true)
    await view.get('.month-select').setValue('12')
    await view.get('[aria-label="Siguiente"]').trigger('click')
    expect(view.find('[data-date="2027-01-01"]').exists()).toBe(true)
    await view.get('[aria-label="Anterior"]').trigger('click')
    expect(view.find('[data-date="2026-12-31"]').exists()).toBe(true)
  })
  it('lets users select a birth year without typing', async () => {
    const view = render({ modelValue: '2026-10-18' })
    await view.get('input').trigger('click')
    await view.get('.year-toggle').trigger('click')
    expect(view.findAll('.year-grid button')).toHaveLength(12)
    await view.get('[aria-label="Anterior"]').trigger('click')
    await view.get('[aria-label="Siguiente"]').trigger('click')
    await view.findAll('.year-grid button')[0]!.trigger('click')
    expect(view.find('[data-date="2021-10-01"]').exists()).toBe(true)
    expect(view.find('.year-grid').exists()).toBe(false)
  })
  it('disables dates outside the supplied range and opens at the nearest limit', async () => {
    const view = render({ min: '2030-01-10', max: '2030-01-20' })
    await view.get('input').trigger('click')
    expect(view.get('[data-date="2030-01-09"]').attributes('disabled')).toBeDefined()
    expect(view.get('[data-date="2030-01-21"]').attributes('disabled')).toBeDefined()
    await view.get('[data-date="2030-01-09"]').trigger('click')
    expect(view.emitted('update:modelValue')).toBeUndefined()
    await view.get('[data-date="2030-01-10"]').trigger('click')
    expect(view.emitted('update:modelValue')).toEqual([['2030-01-10']])
  })
  it('clamps an empty selection to a maximum in the past', async () => {
    const view = render({ max: '2000-02-29' })
    await view.get('input').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(document.activeElement).toBe(view.get('[data-date="2000-02-29"]').element)
  })
  it('supports clearing optional dates and keeps required dates without a clear action', async () => {
    const view = render({ modelValue: '2000-02-29' })
    await view.get('input').trigger('click')
    await view.get('.calendar-footer button').trigger('click')
    expect(view.emitted('update:modelValue')).toEqual([['']])
    await view.setProps({ required: true })
    await view.get('input').trigger('click')
    expect(view.get('.calendar-footer').text()).toBe('Cerrar')
    expect(view.get('input').attributes('required')).toBeDefined()
  })
  it('closes with Escape and outside clicks, but keeps clicks inside open', async () => {
    const view = render()
    await view.get('input').trigger('click')
    await view.get('.year-toggle').trigger('pointerdown')
    expect(view.find('[role="dialog"]').exists()).toBe(true)
    await view.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    await view.get('input').trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(view.find('[role="dialog"]').exists()).toBe(false)
  })
  it('closes on leaving the field and when disabled', async () => {
    const view = render()
    await view.get('input').trigger('click')
    await view.get('input').trigger('focusout', { relatedTarget: document.body })
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    await view.get('input').trigger('click')
    await view.setProps({ disabled: true })
    expect(view.find('[role="dialog"]').exists()).toBe(false)
    await view.get('input').trigger('click')
    expect(view.find('[role="dialog"]').exists()).toBe(false)
  })
  it('lets Escape reach the parent dialog when the calendar is already closed', async () => {
    const view = render()
    // Vue ignores events created in the same millisecond as listener attachment.
    vi.advanceTimersByTime(1)
    const closedEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    view.get('input').element.dispatchEvent(closedEvent)
    expect(closedEvent.defaultPrevented).toBe(false)
    await view.get('input').trigger('click')
    const openEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    view.get('input').element.dispatchEvent(openEvent)
    await nextTick()
    expect(openEvent.defaultPrevented).toBe(true)
    expect(view.find('[role="dialog"]').exists()).toBe(false)
  })
  it('moves the focused day with arrow keys across months, respecting bounds', async () => {
    const view = render({ modelValue: '2000-02-29', min: '2000-02-29', max: '2000-03-08' })
    await view.get('input').trigger('click')
    await view.get('[data-date="2000-02-29"]').trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    expect(document.activeElement).toBe(view.get('[data-date="2000-02-29"]').element)
    await view.get('[data-date="2000-02-29"]').trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(document.activeElement).toBe(view.get('[data-date="2000-03-01"]').element)
    await view.get('[data-date="2000-03-01"]').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(document.activeElement).toBe(view.get('[data-date="2000-03-08"]').element)
    await view.get('[data-date="2000-03-08"]').trigger('keydown', { key: 'ArrowUp' })
    await view.get('[data-date="2000-03-01"]').trigger('keydown', { key: 'Tab' })
    expect(view.emitted('update:modelValue')).toBeUndefined()
  })
  it.each(['0001-01-01', '9999-12-31'])(
    'keeps navigation within supported years: %s',
    async (modelValue) => {
      const view = render({ modelValue })
      await view.get('input').trigger('click')
      await view
        .get(modelValue.startsWith('0001') ? '[aria-label="Anterior"]' : '[aria-label="Siguiente"]')
        .trigger('click')
      expect(view.find(`[data-date="${modelValue}"]`).exists()).toBe(true)
      await view.get('.year-toggle').trigger('click')
      await view
        .get(modelValue.startsWith('0001') ? '[aria-label="Anterior"]' : '[aria-label="Siguiente"]')
        .trigger('click')
      expect(view.findAll('.year-grid button')).toHaveLength(12)
    },
  )
  it('ignores malformed stored values and lets the trigger close an open calendar', async () => {
    const view = render({ modelValue: 'bad' })
    expect(view.get<HTMLInputElement>('input').element.value).toBe('')
    await view.get('input').trigger('click')
    await view.get('input').trigger('click')
    expect(view.find('[role="dialog"]').exists()).toBe(false)
  })
})
