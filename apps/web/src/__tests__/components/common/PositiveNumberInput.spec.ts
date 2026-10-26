import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PositiveNumberInput from '@/components/common/PositiveNumberInput.vue'

describe('PositiveNumberInput', () => {
  const props = {
    label: 'Duración'
  }

  it('renders the label and input', () => {
    const wrapper = mount(PositiveNumberInput, { props })

    expect(wrapper.find('label').text()).toBe('Duración')
    expect(wrapper.find('input').attributes('type')).toBe('number')
  })

  it('updates the value when typing', async () => {
    const wrapper = mount(PositiveNumberInput, { props })

    await wrapper.find('input').setValue('120')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([120])
  })

  it('shows an error for zero', async () => {
    const wrapper = mount(PositiveNumberInput, { props })
    const input = wrapper.find('input')

    await input.setValue('0')
    await input.trigger('blur')

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(input.attributes('aria-invalid')).toBe('true')
  })

  it('shows an error when a required field is empty', async () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, required: true }
    })

    await wrapper.find('input').trigger('blur')

    expect(wrapper.find('[role="alert"]').text())
      .toBe('Este campo es obligatorio.')
  })

  it('accepts valid positive numbers', async () => {
    const wrapper = mount(PositiveNumberInput, { props })
    const input = wrapper.find('input')

    await input.setValue('120')
    await input.trigger('blur')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(input.attributes('aria-invalid')).toBe('false')
  })

  it('disables the input when disabled is true', () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, disabled: true }
    })

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })
})
