import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PurchaseStepper from '@/components/purchases/PurchaseStepper.vue'
describe('PurchaseStepper', () => {
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
