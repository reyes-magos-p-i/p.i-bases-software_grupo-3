import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import SalesPeriodFilter from '@/components/statistics/SalesPeriodFilter.vue'
import DatePicker from '@/components/common/DatePicker.vue'

let view: VueWrapper
beforeEach(() =>
  vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-11-23T12:00:00-06:00')),
)
afterEach(() => {
  view?.unmount()
  vi.useRealTimers()
})
describe('SalesPeriodFilter', () => {
  it('applies presets immediately and offers a custom range', async () => {
    view = mount(SalesPeriodFilter)
    await view.get('select').setValue('today')
    const applied = view.emitted('apply')?.[0]?.[0] as { dateFrom: string; dateTo: string }
    expect(applied.dateFrom).toBe(applied.dateTo)
    await view.get('select').setValue('custom')
    expect(view.findAllComponents(DatePicker)).toHaveLength(2)
    expect(view.emitted('apply')).toHaveLength(1)
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })
  it('validates custom periods before issuing a request and accepts a single day', async () => {
    view = mount(SalesPeriodFilter)
    await view.get('select').setValue('custom')
    const [from, to] = view.findAllComponents(DatePicker)
    await from!.vm.$emit('update:modelValue', '2026-11-21')
    await to!.vm.$emit('update:modelValue', '2026-11-01')
    await view.get('form').trigger('submit')
    expect(view.get('[role="alert"]').text()).toContain('posterior')
    expect(view.emitted('apply')).toBeUndefined()
    expect(from!.get('input').attributes('aria-invalid')).toBe('true')
    await to!.vm.$emit('update:modelValue', '2026-11-21')
    await view.get('form').trigger('submit')
    expect(view.emitted('apply')).toEqual([[{ dateFrom: '2026-11-21', dateTo: '2026-11-21' }]])
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })
  it('asks for both dates and clears a validation error on a preset change', async () => {
    view = mount(SalesPeriodFilter)
    await view.get('select').setValue('custom')
    await view.findAllComponents(DatePicker)[0]!.vm.$emit('update:modelValue', '')
    await view.get('form').trigger('submit')
    expect(view.get('[role="alert"]').text()).toContain('fecha de inicio y la fecha de fin')
    expect(view.emitted('apply')).toBeUndefined()
    await view.get('select').setValue('last7days')
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(view.emitted('apply')).toHaveLength(1)
  })
  it.each([0, 1])(
    'disables future calendar days in field %i while keeping today selectable',
    async (index) => {
      view = mount(SalesPeriodFilter, {
        props: { initialPeriod: { dateFrom: '2026-11-23', dateTo: '2026-11-23' } },
      })
      const picker = view.findAllComponents(DatePicker)[index]!
      expect(picker.props('max')).toBe('2026-11-23')
      await picker.get('input').trigger('click')
      expect(picker.get('[data-date="2026-11-23"]').attributes('disabled')).toBeUndefined()
      expect(picker.get('[data-date="2026-11-24"]').attributes('disabled')).toBeDefined()
      await picker.get('.calendar-footer button').trigger('click')
    },
  )
  it.each([0, 1])('rejects a future date in field %i before applying the period', async (index) => {
    view = mount(SalesPeriodFilter)
    await view.get('select').setValue('custom')
    const pickers = view.findAllComponents(DatePicker)
    await pickers[index]!.vm.$emit('update:modelValue', '2026-11-24')
    await view.get('form').trigger('submit')
    expect(view.get('[role="alert"]').text()).toBe(
      'Las fechas del periodo no pueden ser posteriores a hoy.',
    )
    expect(view.emitted('apply')).toBeUndefined()
    await pickers[index]!.vm.$emit('update:modelValue', '2026-11-23')
    await view.get('form').trigger('submit')
    expect(view.emitted('apply')).toHaveLength(1)
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })
  it('supports isolated identifiers and explicit submission without changing dashboard defaults', async () => {
    view = mount(SalesPeriodFilter, {
      props: {
        initialPeriod: { dateFrom: '2026-11-01', dateTo: '2026-11-21' },
        idPrefix: 'report',
        autoApply: false,
        alwaysShowSubmit: true,
        surface: 'light',
      },
    })
    expect(view.findAllComponents(DatePicker)).toHaveLength(2)
    expect(view.get('label').attributes('for')).toBe('report-period')
    await view.get('select').setValue('today')
    expect(view.emitted('apply')).toBeUndefined()
    expect(view.find('button[type="submit"]').exists()).toBe(true)
    await view.get('form').trigger('submit')
    expect(view.emitted('apply')).toHaveLength(1)
    await view.setProps({ disabled: true })
    await view.get('form').trigger('submit')
    expect(view.emitted('apply')).toHaveLength(1)
  })
})
