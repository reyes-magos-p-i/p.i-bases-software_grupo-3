import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PurchaseStepper from '@/components/purchases/PurchaseStepper.vue'
describe('PurchaseStepper', () => {
  it('adapts the same progress bar to the five guest steps and clamps invalid positions', async () => {
    const wrapper = mount(PurchaseStepper, {
      props: { step: 3, labels: ['Función', 'Asientos', 'Correo', 'Resumen', 'Compra lista'] },
    })
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Correo')
    expect(wrapper.get('.step-progress').attributes('style')).toContain('width: 50%')
    expect(wrapper.get('nav').attributes('style')).toContain('--step-count: 5')
    await wrapper.setProps({ step: 99 })
    expect(wrapper.get('.step-progress').attributes('style')).toContain('width: 100%')
    await wrapper.setProps({ step: -1, labels: [] })
    expect(wrapper.get('.step-progress').attributes('style')).toContain('width: 0%')
    expect(wrapper.findAll('li')).toHaveLength(1)
    wrapper.unmount()
  })
  it('identifies the current step and updates its accessible progress', async () => {
    const wrapper = mount(PurchaseStepper, { props: { step: 1 } })
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Función')
    expect(wrapper.get('.step-progress').attributes('style')).toContain('width: 0%')
    await wrapper.setProps({ step: 3 })
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Resumen')
    expect(wrapper.findAll('.completed')).toHaveLength(2)
    expect(wrapper.get('.step-progress').attributes('style')).toContain('66.666')
    await wrapper.setProps({ step: 4 })
    expect(wrapper.get('.step-progress').attributes('style')).toContain('width: 100%')
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Compra lista')
    expect(wrapper.get('.step-track').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })
})
