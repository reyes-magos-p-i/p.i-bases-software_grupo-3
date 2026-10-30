import { afterEach, describe, it, expect } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'

enableAutoUnmount(afterEach)

describe('ReusableSearchDropdown', () => {
  const props = {
    label: 'Géneros',
    options: [
      { value: 1, label: 'Acción' },
      { value: 2, label: 'Aventura' },
      { value: 3, label: 'Comedia' },
    ],
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
        modelValue: [1],
      },
    })

    await wrapper.find('.remove-option').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[]])
  })

  it('shows a message when no options match', async () => {
    const wrapper = mount(ReusableSearchDropdown, { props })

    await wrapper.find('.search-input').setValue('xyz')

    expect(wrapper.find('.dropdown-empty').text()).toBe('No se encontraron resultados')
  })

  it('disables the input when disabled is true', () => {
    const wrapper = mount(ReusableSearchDropdown, {
      props: { ...props, disabled: true },
    })

    expect(wrapper.find('.search-input').attributes('disabled')).toBeDefined()
  })
  it('opens all options without typing when configured for browsing', async () => {
    const wrapper = mount(ReusableSearchDropdown, {
      props: { ...props, minSearchLength: 0, compact: true },
    })
    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
    await wrapper.get('.toggle-options').trigger('click')
    expect(wrapper.findAll('.dropdown-option')).toHaveLength(3)
    expect(wrapper.get('.toggle-options').attributes('aria-expanded')).toBe('true')
    const inputId = wrapper.get('.search-input').attributes('id')
    expect(wrapper.get('label').attributes('for')).toBe(inputId)
    await wrapper.get('.toggle-options').trigger('click')
    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
    await wrapper.get('.search-input').trigger('focus')
    expect(wrapper.find('.dropdown-options').exists()).toBe(true)
  })
  it('limits the preview to three chips while retaining every selected option', async () => {
    const options = Array.from({ length: 20 }, (_, index) => ({
      value: index + 1,
      label: `Opción ${index + 1}`,
    }))
    const wrapper = mount(ReusableSearchDropdown, {
      props: {
        label: 'Idiomas',
        options,
        modelValue: options.map((option) => option.value),
        compact: true,
        minSearchLength: 0,
      },
    })
    expect(wrapper.findAll('.selected-option')).toHaveLength(3)
    expect(wrapper.get('.selection-overflow').text()).toBe('y 17 más')
    await wrapper.get('.search-input').trigger('focus')
    expect(wrapper.findAll('input[type="checkbox"]:checked')).toHaveLength(20)
  })
  it('keeps the complete chip preview by default for existing consumers', () => {
    const wrapper = mount(ReusableSearchDropdown, { props: { ...props, modelValue: [1, 2, 3] } })
    expect(wrapper.findAll('.selected-option')).toHaveLength(3)
    expect(wrapper.find('.toggle-options').exists()).toBe(false)
    expect(wrapper.find('.selection-overflow').exists()).toBe(false)
  })
  it('closes on outside pointer interactions and Escape but keeps inside interactions open', async () => {
    const wrapper = mount(ReusableSearchDropdown, {
      props: { ...props, minSearchLength: 0 },
      attachTo: document.body,
    })
    await wrapper.get('.search-input').trigger('focus')
    wrapper
      .get('.dropdown-options')
      .element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(wrapper.find('.dropdown-options').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
    await wrapper.get('.search-input').trigger('click')
    await wrapper.get('input[type="checkbox"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.search-input').element)
  })
  it('closes when keyboard focus leaves but not when moving inside the component', async () => {
    const wrapper = mount(ReusableSearchDropdown, { props: { ...props, minSearchLength: 0 } })
    await wrapper.get('.search-input').trigger('focus')
    await wrapper
      .get('.search-input')
      .trigger('focusout', { relatedTarget: wrapper.get('input[type="checkbox"]').element })
    expect(wrapper.find('.dropdown-options').exists()).toBe(true)
    await wrapper.get('.search-input').trigger('focusout', { relatedTarget: document.body })
    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
  })
  it('enforces a selection limit while still allowing deselection', async () => {
    const wrapper = mount(ReusableSearchDropdown, {
      props: { ...props, modelValue: [1], minSearchLength: 0, maxSelections: 1 },
    })
    await wrapper.get('.search-input').trigger('focus')
    const checkboxes = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxes[1]!.element.disabled).toBe(true)
    await checkboxes[1]!.trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await checkboxes[0]!.setValue(false)
    expect(wrapper.emitted('update:modelValue')).toEqual([[[]]])
  })
  it('closes and rejects interactions when disabled while open', async () => {
    const wrapper = mount(ReusableSearchDropdown, {
      props: { ...props, modelValue: [1], minSearchLength: 0, compact: true },
    })
    await wrapper.get('.search-input').trigger('focus')
    await wrapper.setProps({ disabled: true })
    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
    await wrapper.get('.search-input').trigger('focus')
    await wrapper.get('.toggle-options').trigger('click')
    await wrapper.get('.remove-option').trigger('click')
    expect(wrapper.find('.dropdown-options').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
