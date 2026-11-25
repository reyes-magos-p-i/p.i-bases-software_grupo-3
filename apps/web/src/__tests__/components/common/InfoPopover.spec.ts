import { afterEach, describe, expect, it } from 'vitest'
import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import InfoPopover from '@/components/common/InfoPopover.vue'

enableAutoUnmount(afterEach)
const body = new DOMWrapper(document.body)
describe('InfoPopover', () => {
  it('keeps explanations hidden until requested and supports closing and reopening', async () => {
    const view = mount(InfoPopover, {
      props: { title: 'Información del gráfico', surface: 'dark' },
      slots: { default: '<p>Se calcula con los datos del comprador.</p>' },
    })
    const button = view.get('button')
    expect(button.attributes('aria-label')).toBe('Información del gráfico')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(body.find('[role="dialog"]').exists()).toBe(false)
    await button.trigger('click')
    await flushPromises()
    expect(body.get('[role="dialog"]').text()).toContain('datos del comprador')
    expect(button.attributes('aria-controls')).toBe(body.get('[role="dialog"]').attributes('id'))
    expect(button.attributes('aria-expanded')).toBe('true')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(body.find('[role="dialog"]').exists()).toBe(false)
    await button.trigger('click')
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('false')
  })
})
