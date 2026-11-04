import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ClientProfileForm from '@/components/clients/ClientProfileForm.vue'
import ConfirmationDialog from '@/components/common/ConfirmationDialog.vue'
import type { ClientProfile } from '@/types/client-profile'

describe('ClientProfileForm', () => {
  const profile: ClientProfile = {
    id: 7,
    role: 'CLIENT',
    status: 'ACTIVE',
    firstName: 'Ana',
    secondName: null,
    firstSurname: 'Rojas',
    secondSurname: null,
    email: 'ana@example.com',
    birthday: '2000-01-01',
    createdAt: null,
    gender: null,
    phoneNumber: null,
    language: 'es',
    address: null,
  }
  const options = {
    provinces: [{ id: 1, label: 'San José' }],
    cantons: [{ id: 2, label: 'Central', provinceId: 1 }],
    districts: [{ id: 3, label: 'Carmen', cantonId: 2 }],
  }
  const mountForm = (override = profile) =>
    mount(ClientProfileForm, {
      props: { profile: override, options },
      global: { stubs: { ConfirmationDialog: true } },
    })

  it('keeps immutable fields out of the edit form and waits until blur to validate names', async () => {
    const wrapper = mountForm()
    expect(wrapper.find('[name="email"]').exists()).toBe(false)
    expect(wrapper.find('[name="birthday"]').exists()).toBe(false)
    await wrapper.get('[name="firstName"]').setValue('Ana1')
    expect(wrapper.text()).not.toContain('sin números')
    await wrapper.get('[name="firstName"]').trigger('blur')
    expect(wrapper.text()).toContain('sin números')
    await wrapper.get('[name="firstName"]').setValue('María')
    expect(wrapper.text()).not.toContain('sin números')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.getComponent(ConfirmationDialog).props('open')).toBe(true)
    expect(wrapper.emitted('save')).toBeUndefined()
    wrapper.getComponent(ConfirmationDialog).vm.$emit('confirm')
    expect(wrapper.emitted('save')).toEqual([[{ firstName: 'María' }]])
    expect(wrapper.emitted('dirty')?.slice(-1)[0]).toEqual([true])
    wrapper.unmount()
  })
  it.each(['', 'Name!', 'Name1', 'A'.repeat(101), '\uD800'])(
    'rejects invalid names %p without requesting a save',
    async (firstName) => {
      const wrapper = mountForm()
      await wrapper.get('[name="firstName"]').setValue(firstName)
      await wrapper.get('form').trigger('submit')
      expect(wrapper.getComponent(ConfirmationDialog).props('open')).toBe(false)
      expect(wrapper.emitted('save')).toBeUndefined()
      expect(wrapper.findAll('.field-error').some((error) => error.text().length > 0)).toBe(true)
      wrapper.unmount()
    },
  )
  it('normalizes mobile numbers and permits clearing optional fields and gender', async () => {
    const wrapper = mountForm({ ...profile, secondName: 'María', gender: 'F' })
    await wrapper.get('[name="secondName"]').setValue('')
    await wrapper.get('[name="phoneNumber"]').setValue('+506 8888-7777')
    await wrapper.get('[name="gender"]').setValue('')
    await wrapper.get('form').trigger('submit')
    wrapper.getComponent(ConfirmationDialog).vm.$emit('confirm')
    expect(wrapper.emitted('save')).toEqual([
      [{ secondName: null, phoneNumber: '88887777', gender: null }],
    ])
    wrapper.unmount()
  })
  it('validates Costa Rican mobile numbers before a save', async () => {
    const wrapper = mountForm()
    await wrapper.get('[name="phoneNumber"]').setValue('22223333')
    await wrapper.get('[name="phoneNumber"]').trigger('blur')
    expect(wrapper.text()).toContain('Costa Rica')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.getComponent(ConfirmationDialog).props('open')).toBe(false)
    await wrapper.get('[name="phoneNumber"]').setValue('88887777')
    expect(wrapper.text()).not.toContain('Costa Rica')
    wrapper.unmount()
  })
  it('requires valid cascading locations and validates address details with a character counter', async () => {
    const wrapper = mountForm()
    await wrapper.get('[name="hasAddress"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('distrito válidos')
    await wrapper.get('[name="provinceId"]').setValue(1)
    await wrapper.get('[name="cantonId"]').setValue(2)
    await wrapper.get('[name="districtId"]').setValue(3)
    await wrapper.get('[name="details"]').setValue('á'.repeat(128))
    expect(wrapper.get('.counter').text()).toBe('128/255')
    await wrapper.get('[name="details"]').trigger('blur')
    expect(wrapper.text()).toContain('demasiado largo')
    await wrapper.get('[name="details"]').setValue(' Cerca del cine ')
    await wrapper.get('form').trigger('submit')
    wrapper.getComponent(ConfirmationDialog).vm.$emit('confirm')
    expect(wrapper.emitted('save')).toEqual([
      [{ address: { districtId: 3, details: 'Cerca del cine' } }],
    ])
    wrapper.unmount()
  })
  it('can unlink an address without modifying a shared address record', async () => {
    const address = {
      id: 9,
      provinceId: 1,
      provinceName: 'San José',
      cantonId: 2,
      cantonName: 'Central',
      districtId: 3,
      districtName: 'Carmen',
      details: null,
    }
    const wrapper = mountForm({ ...profile, address })
    await wrapper.get('[name="hasAddress"]').setValue(false)
    await wrapper.get('form').trigger('submit')
    wrapper.getComponent(ConfirmationDialog).vm.$emit('confirm')
    expect(wrapper.emitted('save')).toEqual([[{ address: null }]])
    wrapper.unmount()
  })
  it('does not send unchanged historical names or empty updates and allows cancelling confirmation', async () => {
    const wrapper = mountForm({ ...profile, firstSurname: 'Legacy-Name' })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('No hay cambios')
    await wrapper.get('[name="gender"]').setValue('N')
    await wrapper.get('form').trigger('submit')
    wrapper.getComponent(ConfirmationDialog).vm.$emit('cancel')
    await wrapper.vm.$nextTick()
    expect(wrapper.getComponent(ConfirmationDialog).props('open')).toBe(false)
    await wrapper.findAll('.actions button')[0]!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
  it('blocks repeated submissions while pending', async () => {
    const wrapper = mountForm()
    await wrapper.get('[name="firstName"]').setValue('María')
    await wrapper.get('form').trigger('submit')
    await wrapper.setProps({ pending: true })
    wrapper.getComponent(ConfirmationDialog).vm.$emit('confirm')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it.each(['[name="firstName"]', '[name="phoneNumber"]'])(
    'allows cancelling invalid %s without blur feedback',
    async (selector) => {
      const wrapper = mountForm()
      const field = wrapper.get(selector)
      await field.setValue(selector.includes('firstName') ? 'Ana123' : '22223333')
      const cancel = wrapper.findAll('.actions button')[0]!
      await field.trigger('blur', { relatedTarget: cancel.element })
      expect(wrapper.findAll('.field-error').every((item) => item.text() === '')).toBe(true)
      await cancel.trigger('click')
      expect(wrapper.emitted('cancel')).toHaveLength(1)
      expect(wrapper.emitted('save')).toBeUndefined()
      wrapper.unmount()
    },
  )

  it('keeps address blur validation from interrupting cancellation', async () => {
    const wrapper = mountForm()
    await wrapper.get('[name="hasAddress"]').setValue(true)
    const details = wrapper.get('[name="details"]')
    await details.setValue('á'.repeat(128))
    const cancel = wrapper.findAll('.actions button')[0]!
    await details.trigger('blur', { relatedTarget: cancel.element })
    await wrapper.get('[name="districtId"]').trigger('blur', { relatedTarget: cancel.element })
    expect(wrapper.findAll('.field-error').every((item) => item.text() === '')).toBe(true)
    await cancel.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
    wrapper.unmount()
  })
})
