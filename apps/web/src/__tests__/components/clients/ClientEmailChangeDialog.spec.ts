import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ClientEmailChangeDialog from '@/components/clients/ClientEmailChangeDialog.vue'
import BaseModal from '@/components/common/BaseModal.vue'

describe('ClientEmailChangeDialog', () => {
  const options = {
    props: { open: true, currentEmail: 'old@example.com' },
    global: { stubs: { BaseModal: { template: '<section><slot /></section>' } } },
  }
  it('validates on blur or submit and emits the normalized email only after validation', async () => {
    const wrapper = mount(ClientEmailChangeDialog, options)
    await wrapper.get('input').setValue('incomplete')
    expect(wrapper.text()).not.toContain('Escribe un correo electrónico válido')
    await wrapper.get('input').trigger('blur')
    expect(wrapper.text()).toContain('Escribe un correo electrónico válido')
    await wrapper.get('input').setValue(' NEW@Example.com ')
    expect(wrapper.text()).not.toContain('Escribe un correo electrónico válido')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('request')).toEqual([['new@example.com']])
    expect(wrapper.text()).toContain('30 minutos')
    expect(wrapper.text()).toContain('se cerrarán tus sesiones')
    wrapper.unmount()
  })
  it('rejects unchanged or invalid email and permits cancellation', async () => {
    const wrapper = mount(ClientEmailChangeDialog, options)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('request')).toBeUndefined()
    await wrapper.get('input').setValue('OLD@EXAMPLE.COM')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('diferente al actual')
    await wrapper.findAll('button')[0]!.trigger('click')
    wrapper.getComponent(BaseModal).vm.$emit('close')
    expect(wrapper.emitted('close')).toHaveLength(2)
    await wrapper.setProps({ open: false })
    expect(wrapper.get('input').element.value).toBe('')
    wrapper.unmount()
  })
  it('prevents repeat submissions during sending and displays request errors', async () => {
    const wrapper = mount(ClientEmailChangeDialog, {
      ...options,
      props: { ...options.props, pending: true, error: 'Correo reservado' },
    })
    await wrapper.get('input').setValue('new@example.com')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('request')).toBeUndefined()
    expect(wrapper.text()).toContain('Enviando…')
    expect(wrapper.get('[role="alert"]').text()).toBe('Correo reservado')
    wrapper.unmount()
  })
})
