import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmationDialog from '@/components/common/ConfirmationDialog.vue'
import BaseModal from '@/components/common/BaseModal.vue'

describe('ConfirmationDialog', () => {
  const options = {
    props: { open: true, title: 'Confirmar', message: '¿Continuar?' },
    global: {
      stubs: {
        BaseModal: {
          props: ['open', 'title', 'closeDisabled'],
          template: '<section v-if="open"><slot /></section>',
        },
      },
    },
  }
  it('confirms or cancels without performing any request', async () => {
    const wrapper = mount(ConfirmationDialog, options)
    expect(wrapper.text()).toContain('¿Continuar?')
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.getComponent(BaseModal).vm.$emit('close')
    expect(wrapper.emitted('cancel')).toHaveLength(2)
    wrapper.unmount()
  })
  it('locks closing and actions while pending and supports destructive labels', () => {
    const wrapper = mount(ConfirmationDialog, {
      ...options,
      props: { ...options.props, danger: true, pending: true, confirmLabel: 'Desactivar' },
    })
    expect(wrapper.findAll('button:disabled')).toHaveLength(2)
    expect(wrapper.get('.confirm.danger').text()).toBe('Procesando…')
    expect(wrapper.getComponent(BaseModal).props('closeDisabled')).toBe(true)
    wrapper.unmount()
  })
})
