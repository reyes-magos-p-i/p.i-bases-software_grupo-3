import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseModal from '@/components/common/BaseModal.vue'

describe('BaseModal.vue', () => {
  it('no renderiza contenido cuando open es false', () => {
    const wrapper = mount(BaseModal, {
      props: { open: false, title: 'Test Modal' },
      global: { stubs: { Teleport: true } },
    })
    expect(wrapper.find('.app-modal-backdrop').exists()).toBe(false)
  })

  it('renderiza título y contenido slot cuando open es true', () => {
    const wrapper = mount(BaseModal, {
      props: { open: true, title: 'Mi Título' },
      slots: { default: '<p id="modal-content">Contenido interior</p>' },
      global: { stubs: { Teleport: true } },
    })

    expect(wrapper.find('#modal-title').text()).toBe('Mi Título')
    expect(wrapper.find('#modal-content').text()).toBe('Contenido interior')
  })

  it('emite close al hacer clic en el botón cerrar', async () => {
    const wrapper = mount(BaseModal, {
      props: { open: true, title: 'Test' },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.find('.app-modal-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emite close al presionar la tecla Escape y limpia listener al desmontar', async () => {
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener')

    const wrapper = mount(BaseModal, {
      props: { open: true, title: 'Test' },
      global: { stubs: { Teleport: true } },
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(wrapper.emitted('close')).toBeFalsy()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
    expect(removeListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('emite close al hacer click sobre el backdrop', async () => {
    const wrapper = mount(BaseModal, {
      props: { open: true, title: 'Test' },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.find('.app-modal-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})