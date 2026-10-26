import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DatePicker from '@/components/common/DatePicker.vue'

let wrapper: VueWrapper<InstanceType<typeof DatePicker>>
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
  vi.useRealTimers()
})

describe('DatePicker', () => {
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
