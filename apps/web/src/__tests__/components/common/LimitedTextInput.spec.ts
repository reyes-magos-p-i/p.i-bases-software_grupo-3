import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LimitedTextInput from '@/components/common/LimitedTextInput.vue'

describe('LimitedTextInput', () => {
  it('counts Unicode characters and does not validate when leaving to cancel', async () => {
    const cancel = document.createElement('button')
    document.body.append(cancel)
    const wrapper = mount(LimitedTextInput, {
      props: { label: 'Sinopsis', limit: 1, modelValue: '🎬á' },
    })
    expect(wrapper.get('.character-counter').text()).toBe('2 / 1')
    await wrapper.get('input').trigger('blur', { relatedTarget: cancel })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.get('input').trigger('blur')
    expect(wrapper.get('[role="alert"]').text()).toBe('Escribe como máximo 1 carácter.')
    wrapper.unmount()
    cancel.remove()
  })
  const props = {
    label: 'Título',
    limit: 10,
  }

  it('renders the label and initial counter', () => {
    const wrapper = mount(LimitedTextInput, { props })

    expect(wrapper.find('label').text()).toBe('Título')
    expect(wrapper.find('.character-counter').text()).toBe('0 / 10')
  })

  it('updates the counter when typing', async () => {
    const wrapper = mount(LimitedTextInput, { props })

    await wrapper.find('input').setValue('Hello')

    expect(wrapper.find('.character-counter').text()).toBe('5 / 10')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Hello'])
  })

  it('shows an error when the limit is exceeded', async () => {
    const wrapper = mount(LimitedTextInput, { props })

    await wrapper.find('input').setValue('Hello World')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.find('input').trigger('blur')

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('.character-counter').text()).toBe('11 / 10')
  })

  it('renders a textarea when multiline is true', () => {
    const wrapper = mount(LimitedTextInput, {
      props: { ...props, multiline: true },
    })

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('disables the input when disabled is true', () => {
    const wrapper = mount(LimitedTextInput, {
      props: { ...props, disabled: true },
    })

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })
})
