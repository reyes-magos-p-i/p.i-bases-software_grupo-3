
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SimpleDropdown from '@/components/common/SimpleDropdown.vue'

describe('SimpleDropdown', () => {
  const props = {
    label: 'Clasificación',
    options: [
      { id: 1, name: 'TP' },
      { id: 2, name: 'M15' },
      { id: 3, name: 'M18' }
    ]
  }

  it('renders the label and placeholder', () => {
    const wrapper = mount(SimpleDropdown, { props })

    expect(wrapper.find('label').text()).toBe('Clasificación')
    expect(wrapper.find('option').text()).toBe('Seleccione una opción')
  })

  it('renders all options', () => {
    const wrapper = mount(SimpleDropdown, { props })

    const options = wrapper.findAll('option')

    expect(options).toHaveLength(4)
    expect(options[1]?.text()).toBe('TP')
    expect(options[2]?.text()).toBe('M15')
    expect(options[3]?.text()).toBe('M18')
  })

  it('updates the selected value', async () => {
    const wrapper = mount(SimpleDropdown, { props })

    await wrapper.find('select').setValue('2')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([2])
  })

  it('disables the dropdown when disabled is true', () => {
    const wrapper = mount(SimpleDropdown, {
      props: { ...props, disabled: true }
    })

    expect(wrapper.find('select').attributes('disabled')).toBeDefined()
  })

  it('sets required when required is true', () => {
    const wrapper = mount(SimpleDropdown, {
      props: { ...props, required: true }
    })

    expect(wrapper.find('select').attributes('required')).toBeDefined()
  })
})
