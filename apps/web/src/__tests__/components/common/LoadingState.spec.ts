import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingState from '@/components/common/LoadingState.vue'

describe('LoadingState', () => {
  it('announces the supplied message and hides the decoration from assistive technology', () => {
    const wrapper = mount(LoadingState, { props: { message: 'Cargando clientes…' } })

    expect(wrapper.get('[role="status"]').text()).toBe('Cargando clientes…')
    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.attributes('aria-atomic')).toBe('true')
    expect(wrapper.get('.loading-indicator').attributes('aria-hidden')).toBe('true')
    expect(wrapper.classes()).not.toContain('loading-state--dark')
    wrapper.unmount()
  })

  it('updates the message when reused for another resource', async () => {
    const wrapper = mount(LoadingState, { props: { message: 'Cargando salas…' } })
    await wrapper.setProps({ message: 'Cargando proyecciones…' })

    expect(wrapper.get('[role="status"]').text()).toBe('Cargando proyecciones…')
    expect(wrapper.text()).not.toContain('Cargando salas')
    wrapper.unmount()
  })

  it('supports dark surfaces and switches back to a light surface without changing the message', async () => {
    const wrapper = mount(LoadingState, {
      props: { message: 'Cargando películas…', surface: 'dark' },
    })
    expect(wrapper.classes()).toContain('loading-state--dark')
    expect(wrapper.get('[role="status"]').text()).toBe('Cargando películas…')
    expect(wrapper.get('.loading-indicator').attributes('aria-hidden')).toBe('true')
    await wrapper.setProps({ surface: 'light' })
    expect(wrapper.classes()).not.toContain('loading-state--dark')
    expect(wrapper.get('[role="status"]').text()).toBe('Cargando películas…')
    wrapper.unmount()
  })
})
