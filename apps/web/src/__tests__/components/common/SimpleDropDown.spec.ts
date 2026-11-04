import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SimpleDropdown from '@/components/common/SimpleDropdown.vue'

describe('SimpleDropdown', () => {
  it('capitalizes labels without changing selected values', async () => {
    const view = mount(SimpleDropdown, {
      props: { label: 'Idioma', options: [{ id: 'es', name: 'español' }] },
    })
    expect(view.get('option[value="es"]').text()).toBe('Español')
    await view.get('select').setValue('es')
    expect(view.emitted('update:modelValue')).toEqual([['es']])
    view.unmount()
  })

  it('waits for blur before displaying a missing required selection', async () => {
    const view = mount(SimpleDropdown, { props: { label: 'Idioma', required: true, options: [] } })
    expect(view.find('[role="alert"]').exists()).toBe(false)
    await view.get('select').trigger('blur')
    expect(view.get('[role="alert"]').text()).toBe('Selecciona una opción.')
    const feedbackId = view.get('[role="alert"]').attributes('id')
    expect(view.get('select').attributes('aria-describedby')).toBe(feedbackId)
    view.unmount()
  })

  it('does not let blur validation interrupt cancellation and supports server field messages', async () => {
    const cancel = document.createElement('button')
    document.body.append(cancel)
    const view = mount(SimpleDropdown, { props: { label: 'Idioma', required: true, options: [] } })
    await view.get('select').trigger('blur', { relatedTarget: cancel })
    expect(view.find('[role="alert"]').exists()).toBe(false)
    await view.setProps({ error: 'Selecciona un idioma disponible.' })
    expect(view.get('[role="alert"]').text()).toBe('Selecciona un idioma disponible.')
    view.unmount()
    cancel.remove()
  })
})
