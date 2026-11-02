import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SeatSelectionStep from '@/components/purchases/SeatSelectionStep.vue'
import SeatSelector from '@/components/Seats/SeatSelector.vue'
import type { SeatAvailability } from '@/types/purchase'
const data = {
  function: {
    id: 4,
    title: 'Película',
    branchName: 'Cine',
    theaterId: 3,
    rows: 1,
    columns: 2,
    startsAt: '2099-01-01T20:00:00-06:00',
  },
  seats: [
    { positionId: 1, theaterId: 3, rowNumber: 1, columnNumber: 1, state: 'free', type: 'vip' },
    { positionId: 2, theaterId: 3, rowNumber: 1, columnNumber: 2, state: 'in-use', type: 'normal' },
  ],
  categories: [
    { code: 'GENERAL', label: 'General', base: 3000, description: 'Tarifa general' },
    { code: 'CHILD', label: 'Niño', base: 2500, description: '2 a 12 años' },
  ],
  maxTickets: 6,
} as SeatAvailability
describe('SeatSelectionStep', () => {
  it('reuses the seat map and emits per-seat ticket categories without pricing locally', async () => {
    const wrapper = mount(SeatSelectionStep, {
      props: { availability: data, selected: [data.seats[0]!], categories: {} },
    })
    expect(wrapper.getComponent(SeatSelector).props('theaterId')).toBe(3)
    expect(wrapper.getComponent(SeatSelector).props('maxSelections')).toBe(6)
    expect(wrapper.text()).toContain('hasta 6 boletos por función')
    expect(wrapper.text()).toContain('1 asientos disponibles')
    expect(wrapper.text()).toContain('VIP')
    expect(wrapper.text()).toContain('2 a 12 años')
    expect(wrapper.text()).not.toContain('₡2500')
    expect(wrapper.text()).not.toContain('tarifa base')
    expect(wrapper.text()).toContain('La selección no reserva los asientos.')
    await wrapper.get('select').setValue('CHILD')
    expect(wrapper.emitted('category')).toEqual([[1, 'CHILD']])
    wrapper.getComponent(SeatSelector).vm.$emit('selection-change', [])
    expect(wrapper.emitted('selection')?.slice(-1)[0]).toEqual([[]])
    await wrapper.get('.step-actions .primary').trigger('click')
    expect(wrapper.emitted('continue')).toHaveLength(1)
    await wrapper.get('.step-actions button').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    await wrapper.setProps({ availability: { ...data, seats: [] }, disabled: true })
    expect(wrapper.text()).toContain('no tiene asientos disponibles')
    expect(wrapper.get('.primary').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
