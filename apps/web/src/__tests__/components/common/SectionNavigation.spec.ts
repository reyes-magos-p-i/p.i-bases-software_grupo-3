import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SectionNavigation from '@/components/common/SectionNavigation.vue'

describe('SectionNavigation', () => {
  const items = [
    { id: 'one', label: 'Mis datos', icon: 'bi-person' },
    { id: 'two', label: 'Seguridad', icon: 'bi-lock' },
  ]
  it('renders the selected section and emits navigation without domain logic', async () => {
    const wrapper = mount(SectionNavigation, {
      props: { items, selected: 'one', label: 'Mi cuenta' },
    })
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Mi cuenta')
    expect(wrapper.findAll('button')[0]!.attributes('aria-current')).toBe('page')
    expect(wrapper.findAll('button')[1]!.attributes('aria-current')).toBeUndefined()
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['two']])
    wrapper.unmount()
  })
  it('supports a default label and disabled interaction', () => {
    const wrapper = mount(SectionNavigation, { props: { items, selected: 'one', disabled: true } })
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Secciones')
    expect(wrapper.findAll('button:disabled')).toHaveLength(2)
    wrapper.unmount()
  })
})
