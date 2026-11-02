import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PositiveNumberInput from '@/components/common/PositiveNumberInput.vue'

describe('PositiveNumberInput', () => {
  const props = {
    label: 'Duración',
  }

  it('renders the label and input with default limits', () => {
    const wrapper = mount(PositiveNumberInput, { props })
    const input = wrapper.find('input')

    expect(wrapper.find('label').text()).toBe('Duración')
    expect(input.attributes('type')).toBe('number')
    expect(input.attributes('min')).toBe('1')
    expect(input.attributes('max')).toBeUndefined()
    expect(input.attributes('step')).toBe('1')
  })

  it('updates the value when typing', async () => {
    const wrapper = mount(PositiveNumberInput, { props })

    await wrapper.find('input').setValue('120')

    expect(wrapper.emitted('update:modelValue')).toEqual([[120]])
  })

  it('emits null when the input is cleared', async () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, modelValue: 120 },
    })

    await wrapper.find('input').setValue('')

    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
  })

  it('shows an error for zero with the default minimum', async () => {
    const wrapper = mount(PositiveNumberInput, { props })
    const input = wrapper.find('input')

    await input.setValue('0')
    await input.trigger('blur')

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Ingrese un número entero mayor o igual que 1.',
    )
    expect(input.attributes('aria-invalid')).toBe('true')
  })

  it('shows an error when a required field is empty', async () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, required: true },
    })

    await wrapper.find('input').trigger('blur')

    expect(wrapper.find('[role="alert"]').text()).toBe('Este campo es obligatorio.')
  })

  it('accepts an empty optional field after blur', async () => {
    const wrapper = mount(PositiveNumberInput, { props })
    const input = wrapper.find('input')

    await input.trigger('blur')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(input.attributes('aria-invalid')).toBe('false')
    expect(wrapper.emitted('validity-change')).toEqual([[true]])
  })

  it('accepts valid positive numbers', async () => {
    const wrapper = mount(PositiveNumberInput, { props })
    const input = wrapper.find('input')

    await input.setValue('120')
    await input.trigger('blur')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(input.attributes('aria-invalid')).toBe('false')
  })

  it('sets custom minimum and maximum attributes', () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, min: 10, max: 100 },
    })
    const input = wrapper.find('input')

    expect(input.attributes('min')).toBe('10')
    expect(input.attributes('max')).toBe('100')
  })

  it.each([9, 101, 50.5])('rejects invalid value %s', async (value) => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, min: 10, max: 100 },
    })
    const input = wrapper.find('input')

    await input.setValue(String(value))
    await input.trigger('blur')

    expect(wrapper.find('[role="alert"]').text()).toBe('Ingrese un número entero entre 10 y 100.')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(wrapper.emitted('validity-change')).toEqual([[true], [false]])
  })

  it.each([10, 50, 100])('accepts %i within the inclusive range', async (value) => {
    const wrapper = mount(PositiveNumberInput, {
      props: {
        ...props,
        required: true,
        min: 10,
        max: 100,
      },
    })
    const input = wrapper.find('input')

    await input.setValue(String(value))
    await input.trigger('blur')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(input.attributes('aria-invalid')).toBe('false')
    expect(wrapper.emitted('validity-change')).toEqual([[false], [true]])
  })

  it('disables the input when disabled is true', () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, disabled: true },
    })

    expect(wrapper.find('input').element.disabled).toBe(true)
  })

  it('emits false immediately when a required field is empty', () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, required: true },
    })

    expect(wrapper.emitted('validity-change')).toEqual([[false]])
  })

  it('emits true immediately for an optional empty field', () => {
    const wrapper = mount(PositiveNumberInput, { props })

    expect(wrapper.emitted('validity-change')).toEqual([[true]])
  })

  it.each([
    { value: 50, valid: true },
    { value: 5, valid: false },
    { value: 101, valid: false },
  ])('emits $valid immediately for initial value $value', ({ value, valid }) => {
    const wrapper = mount(PositiveNumberInput, {
      props: {
        ...props,
        required: true,
        min: 10,
        max: 100,
        modelValue: value,
      },
    })

    expect(wrapper.emitted('validity-change')).toEqual([[valid]])
  })

  it('reports validity changes without requiring blur', async () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, required: true, min: 10, max: 100 },
    })
    const input = wrapper.find('input')

    await input.setValue('50')
    await input.setValue('101')
    await input.setValue('100')
    await input.setValue('')

    expect(wrapper.emitted('validity-change')).toEqual([[false], [true], [false], [true], [false]])

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('updates validity when the parent changes the value', async () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, min: 10, max: 100, modelValue: 50 },
    })

    await wrapper.setProps({ modelValue: 5 })
    await wrapper.setProps({ modelValue: 50 })

    expect(wrapper.emitted('validity-change')).toEqual([[true], [false], [true]])
  })

  it('updates validity when the maximum changes', async () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, min: 10, max: 100, modelValue: 50 },
    })

    await wrapper.setProps({ max: 40 })
    await wrapper.setProps({ max: 100 })

    expect(wrapper.emitted('validity-change')).toEqual([[true], [false], [true]])
  })

  it('updates validity when the minimum changes', async () => {
    const wrapper = mount(PositiveNumberInput, {
      props: { ...props, min: 10, max: 100, modelValue: 50 },
    })

    await wrapper.setProps({ min: 60 })
    await wrapper.setProps({ min: 10 })

    expect(wrapper.emitted('validity-change')).toEqual([[true], [false], [true]])
  })

  it('updates validity when an empty field becomes required', async () => {
    const wrapper = mount(PositiveNumberInput, { props })

    await wrapper.setProps({ required: true })
    await wrapper.setProps({ required: false })

    expect(wrapper.emitted('validity-change')).toEqual([[true], [false], [true]])
  })
})
