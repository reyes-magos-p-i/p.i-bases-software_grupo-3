import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PurchaseStepper from '@/components/purchases/PurchaseStepper.vue'
describe('PurchaseStepper', () => {
  it('identifies the current step and updates its accessible progress', async () => {
    const wrapper = mount(PurchaseStepper, { props: { step: 1 } })
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Función')
    await wrapper.setProps({ step: 3 })
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Resumen')
    expect(wrapper.findAll('.completed')).toHaveLength(2)
    wrapper.unmount()
  })
})
