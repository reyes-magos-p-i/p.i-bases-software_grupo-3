import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import SalesPeriodFilter from '@/components/statistics/SalesPeriodFilter.vue'
import DatePicker from '@/components/common/DatePicker.vue'

let view: VueWrapper
afterEach(() => view?.unmount())
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
})
