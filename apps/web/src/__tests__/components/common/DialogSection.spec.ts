import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DialogSection from '@/components/common/DialogSection.vue'

describe('DialogSection', () => {
  it('names an unnumbered section and preserves its content', async () => {
    const wrapper = mount(DialogSection, {
      props: { title: 'Información general' },
      slots: { default: '<p>Datos de consulta</p>' },
    })
    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.attributes('aria-labelledby')).toBe(wrapper.get('h3').attributes('id'))
    expect(wrapper.get('h3').text()).toBe('Información general')
    expect(wrapper.find('.dialog-section-number').exists()).toBe(false)
    expect(wrapper.get('p').text()).toBe('Datos de consulta')
    await wrapper.setProps({ number: 2, title: 'Contacto' })
    expect(wrapper.get('.dialog-section-number').text()).toBe('2')
    expect(wrapper.get('h3').text()).toContain('Contacto')
    wrapper.unmount()
  })

  it('uses a native legend for a disabled field group without owning its fields', async () => {
    const wrapper = mount(DialogSection, {
      props: { title: 'Datos de la sala', number: 1, as: 'fieldset' },
      attrs: { disabled: true },
      slots: { default: '<input name="cinema" value="Centro" />' },
    })
    expect(wrapper.element.tagName).toBe('FIELDSET')
    expect((wrapper.element as HTMLFieldSetElement).disabled).toBe(true)
    expect(wrapper.attributes('aria-labelledby')).toBe(wrapper.get('legend').attributes('id'))
    expect(wrapper.get('.dialog-section-number').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('Centro')
    await wrapper.setProps({ number: undefined })
    expect(wrapper.find('.dialog-section-number').exists()).toBe(false)
    expect(wrapper.get('legend').text()).toBe('Datos de la sala')
    wrapper.unmount()
  })

  it('keeps distinct names when several sections are mounted together', () => {
    const wrapper = mount({
      components: { DialogSection },
      template:
        '<div><DialogSection title="Datos" :number="1" /><DialogSection title="Dirección" :number="2" /></div>',
    })
    const sections = wrapper.findAll('section')
    const names = sections.map((section) => section.attributes('aria-labelledby'))
    expect(new Set(names).size).toBe(2)
    sections.forEach((section) => {
      expect(section.get('h3').attributes('id')).toBe(section.attributes('aria-labelledby'))
    })
    wrapper.unmount()
  })
})
