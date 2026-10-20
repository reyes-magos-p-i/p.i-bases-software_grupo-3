import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AccountMenu from '@/components/common/AccountMenu.vue'

describe('AccountMenu.vue', () => {
  const user = {
    id: 7,
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'Perez',
  }

  it('opens and dismisses the profile menu accessibly', async () => {
    const wrapper = mount(AccountMenu, { props: { user } })

    expect(wrapper.get('.account-name').text()).toBe('Ana Perez')
    expect(wrapper.get('.account-avatar img').attributes('src')).toMatch(/^data:image\/svg\+xml/)
    expect(wrapper.get('.account-avatar').attributes('aria-expanded')).toBe('false')
    await wrapper.get('.account-avatar').trigger('click')
    expect(wrapper.get('.account-avatar').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.account-dropdown').text()).toContain('Ana Perez')
    expect(wrapper.get('.account-dropdown').text()).toContain('ana@example.com')
    expect(wrapper.get('.account-dropdown').text()).toContain('Personalizar perfil')
    expect(wrapper.get('.account-dropdown').text()).toContain('Ajustes de Cuenta')
    expect(wrapper.get('.account-dropdown').text()).toContain('Cambiar Contraseña')
    expect(wrapper.findAll('.account-actions button:disabled')).toHaveLength(2)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.account-dropdown').exists()).toBe(false)
  })

  it('emits logout from the clear exit icon', async () => {
    const wrapper = mount(AccountMenu, { props: { user } })

    await wrapper.get('[aria-label="Cerrar sesión"]').trigger('click')

    expect(wrapper.emitted('logout')).toHaveLength(1)
  })
})
