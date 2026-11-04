import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FunctionSelectionStep from '@/components/purchases/FunctionSelectionStep.vue'
import DatePicker from '@/components/common/DatePicker.vue'
import MoviePoster from '@/components/common/MoviePoster.vue'
import type { PurchaseFunction } from '@/types/purchase'
const functions = [
  {
    id: 4,
    branchId: 1,
    branchName: 'Cine central',
    startsAt: '2099-01-01T20:00:00-06:00',
    theaterId: 3,
    format: '2D',
    technology: 'STANDARD',
    price: 3000,
  },
  {
    id: 5,
    branchId: 2,
    branchName: 'Cine norte',
    startsAt: '2099-01-02T20:00:00-06:00',
    theaterId: 4,
    format: '3D',
    technology: 'IMAX',
    isPremiere: true,
    price: 5000,
  },
] as PurchaseFunction[]
describe('FunctionSelectionStep', () => {
  it('shows current branches and filters functions by branch and calendar date', async () => {
    const wrapper = mount(FunctionSelectionStep, {
      props: {
        movie: { id: 2, title: 'Película', synopsis: 'Una aventura', posterImage: 'poster.jpg' },
        functions,
      },
    })
    expect(wrapper.text()).toContain('Una aventura')
    expect(wrapper.getComponent(MoviePoster).props()).toMatchObject({
      title: 'Película',
      posterImage: 'poster.jpg',
    })
    expect(wrapper.findAll('.functions li')).toHaveLength(2)
    await wrapper.get('select').setValue('2')
    expect(wrapper.findAll('.functions li')).toHaveLength(1)
    expect(wrapper.text()).toContain('IMAX · Estreno')
    await wrapper.get('.functions button').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[5]])
    wrapper.getComponent(DatePicker).vm.$emit('update:modelValue', '2099-01-01')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('No hay funciones disponibles con estos filtros')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Limpiar filtros')!
      .trigger('click')
    expect(wrapper.findAll('.functions li')).toHaveLength(2)
    await wrapper.setProps({ disabled: true })
    expect(wrapper.get('.functions button').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ functions: [] })
    expect(wrapper.text()).toContain('no tiene funciones disponibles')
    wrapper.unmount()
  })
})
