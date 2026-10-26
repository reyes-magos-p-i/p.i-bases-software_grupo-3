import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationPopup from '@/components/common/NotificationPopup.vue'

describe('NotificationPopup', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it.each([
    ['success', 'ÉXITO', 'status'],
    ['alert', 'ADVERTENCIA', 'alert'],
    ['error', 'ERROR', 'alert'],
  ] as const)('renders the %s state', (type, title, role) => {
    const wrapper = mount(NotificationPopup, { props: { type, message: 'Hola' } })

    expect(wrapper.classes()).toContain(`notification-popup--${type}`)
    expect(wrapper.attributes('role')).toBe(role)
    expect(wrapper.text()).toContain(title)
    expect(wrapper.text()).toContain('Hola')
    expect(wrapper.classes()).not.toContain('notification-popup--floating')
    wrapper.unmount()
  })

  it('allows a custom title', () => {
    const wrapper = mount(NotificationPopup, { props: { message: 'x', title: 'LISTO' } })
    expect(wrapper.text()).toContain('LISTO')
    wrapper.unmount()
  })

  it('supports floating placement without changing its content, accessibility or default timeout', async () => {
    const wrapper = mount(NotificationPopup, {
      props: { type: 'error', message: 'No se pudo guardar.', placement: 'bottom-right' },
    })
    expect(wrapper.classes()).toContain('notification-popup--floating')
    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.attributes('aria-live')).toBe('assertive')
    expect(wrapper.text()).toContain('No se pudo guardar.')
    vi.advanceTimersByTime(3999)
    expect(wrapper.emitted('close')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.setProps({ placement: 'inline' })
    expect(wrapper.classes()).not.toContain('notification-popup--floating')
    expect(wrapper.text()).toContain('No se pudo guardar.')
    wrapper.unmount()
  })

  it('emits close after the duration and never when duration is 0', () => {
    const timed = mount(NotificationPopup, { props: { message: 'x', duration: 1000 } })
    vi.advanceTimersByTime(1000)
    expect(timed.emitted('close')).toHaveLength(1)

    const persistent = mount(NotificationPopup, { props: { message: 'x', duration: 0 } })
    vi.advanceTimersByTime(60000)
    expect(persistent.emitted('close')).toBeUndefined()
    timed.unmount()
    persistent.unmount()
  })

  it('pauses auto-dismiss while hovered', async () => {
    const wrapper = mount(NotificationPopup, { props: { message: 'x', duration: 1000 } })
    await wrapper.trigger('mouseenter')
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('close')).toBeUndefined()
    await wrapper.trigger('mouseleave')
    vi.advanceTimersByTime(1000)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
