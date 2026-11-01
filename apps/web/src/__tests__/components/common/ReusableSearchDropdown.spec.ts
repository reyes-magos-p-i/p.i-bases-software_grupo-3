
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'

describe('ReusableSearchDropdown', () => {
  const props = {
    label: 'Géneros',
    options: [
      { value: 1, label: 'Acción' },
      { value: 2, label: 'Aventura' },
      { value: 3, label: 'Comedia' }
    ]
  }

  it('renders the label and input', () => {
    const wrapper = mount(ReusableSearchDropdown, { props })

    expect(wrapper.find('label').text()).toBe('Géneros')
    expect(wrapper.find('.search-input').exists()).toBe(true)
  })

  it('filters options when typing', async () => {
    const wrapper = mount(ReusableSearchDropdown, { props })

    await wrapper.find('.search-input').setValue('Ave')

    const options = wrapper.findAll('.dropdown-option')

    expect(options).toHaveLength(1)
    expect(options[0]?.text()).toContain('Aventura')
  })

  it('does not show options with less than 2 characters', async () => {
    const wrapper = mount(ReusableSearchDropdown, { props })

    await wrapper.find('.search-input').setValue('A')

    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
  })

  it('selects an option', async () => {
    const wrapper = mount(ReusableSearchDropdown, { props })

    await wrapper.find('.search-input').setValue('Acc')

    await wrapper.find('input[type="checkbox"]').setValue(true)

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[1]])
  })

  it('removes a selected option', async () => {
    const wrapper = mount(ReusableSearchDropdown, {
      props: {
        ...props,
        modelValue: [1]
      }
    })

    await wrapper.find('.remove-option').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[]])
  })

  it('shows a message when no options match', async () => {
    const wrapper = mount(ReusableSearchDropdown, { props })

    await wrapper.find('.search-input').setValue('xyz')

    expect(wrapper.find('.dropdown-empty').text())
      .toBe('No se encontraron resultados')
  })

  it('disables the input when disabled is true', () => {
    const wrapper = mount(ReusableSearchDropdown, {
      props: { ...props, disabled: true }
    })

    expect(wrapper.find('.search-input').attributes('disabled'))
      .toBeDefined()
  })
})
