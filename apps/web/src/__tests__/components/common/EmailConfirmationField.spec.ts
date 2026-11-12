import { afterEach, describe, expect, it } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import EmailConfirmationField from '@/components/common/EmailConfirmationField.vue'

let wrapper: VueWrapper<InstanceType<typeof EmailConfirmationField>>
const render = (expectedEmail?: string) =>
  (wrapper = mount(EmailConfirmationField, { props: { expectedEmail }, attachTo: document.body }))
afterEach(() => wrapper?.unmount())

describe('Written email confirmation', () => {
  it('validates only on blur or confirmation and normalizes a matching email', async () => {
    const view = render('admin@example.com')
    await view.get('input').setValue('a')
    expect(view.find('.field-error').exists()).toBe(false)
    await view.get('input').trigger('blur')
    expect(view.get('.field-error').text()).toContain('correo electrónico válido')
    await view.get('input').setValue(' ADMIN@Example.com ')
    expect(view.vm.validate()).toBe('admin@example.com')
    expect(view.find('.field-error').exists()).toBe(false)
  })
  it.each(['', 'wrong@example.com'])(
    'rejects missing or different actor email: %s',
    async (email) => {
      const view = render('admin@example.com')
      await view.get('input').setValue(email)
      expect(view.vm.validate()).toBeNull()
      await flushPromises()
      expect(view.get('.field-error').text()).toContain(email ? 'coincidir' : 'Escribe el correo')
      expect(document.activeElement).toBe(view.get('input').element)
    },
  )
  it('resets the confirmation when the current session email changes', async () => {
    const view = render('admin@example.com')
    await view.get('input').setValue('admin@example.com')
    await view.setProps({ expectedEmail: 'new@example.com' })
    expect((view.get('input').element as HTMLInputElement).value).toBe('')
    expect(view.find('.field-error').exists()).toBe(false)
  })
  it('does not interrupt cancelling or show errors on an untouched blur', async () => {
    const view = render()
    await view.get('input').trigger('blur')
    expect(view.find('.field-error').exists()).toBe(false)
    await view.get('input').setValue('unfinished')
    const cancel = document.createElement('button')
    await view.get('input').trigger('blur', { relatedTarget: cancel })
    expect(view.find('.field-error').exists()).toBe(false)
    await view.setProps({ disabled: true })
    expect(view.get('input').attributes('disabled')).toBeDefined()
  })
  it('validates format when the browser has no current email snapshot', async () => {
    const view = render()
    await view.get('input').setValue('admin@example.com')
    expect(view.vm.validate()).toBe('admin@example.com')
  })
})
