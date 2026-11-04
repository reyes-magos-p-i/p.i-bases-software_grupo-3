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
    expect(wrapper.get('.account-dropdown').text()).toContain('Mi perfil')
    expect(wrapper.get('.account-dropdown').text()).not.toContain('Ajustes de Cuenta')
    expect(wrapper.get('.account-dropdown').text()).toContain('Cambiar contraseña')
    expect(wrapper.findAll('.account-actions button').map((button) => button.text())).toEqual([
      'Mi perfil',
      'Cambiar contraseña',
      'Cerrar sesión',
    ])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.account-dropdown').exists()).toBe(false)
  })

  it('offers logout only inside the profile menu and closes the menu when selected', async () => {
    const wrapper = mount(AccountMenu, { props: { user } })
    expect(wrapper.find('[aria-label="Cerrar sesión"]').exists()).toBe(false)
    await wrapper.get('.account-avatar').trigger('click')
    expect(wrapper.get('.account-dropdown [aria-label="Cerrar sesión"]').text()).toBe(
      'Cerrar sesión',
    )
    await wrapper.get('[aria-label="Cerrar sesión"]').trigger('click')

    expect(wrapper.emitted('logout')).toHaveLength(1)
    expect(wrapper.find('.account-dropdown').exists()).toBe(false)
    wrapper.unmount()
  })
  it('opens the profile through an event and closes the account menu', async () => {
    const wrapper = mount(AccountMenu, { props: { user } })
    await wrapper.get('.account-avatar').trigger('click')
    await wrapper.findAll('.account-actions button')[0]!.trigger('click')
    expect(wrapper.emitted('profile')).toEqual([[]])
    expect(wrapper.find('.account-dropdown').exists()).toBe(false)
    wrapper.unmount()
  })

  it('supports keyboard opening, escape focus restoration and leaving the menu', async () => {
    const wrapper = mount(AccountMenu, { props: { user }, attachTo: document.body })
    const opener = wrapper.get<HTMLButtonElement>('.account-avatar')
    await opener.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('.account-actions button').element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.account-dropdown').exists()).toBe(false)
    expect(document.activeElement).toBe(opener.element)

    await opener.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.account-dropdown').exists()).toBe(false)
    await opener.trigger('keydown', { key: 'ArrowDown' })
    wrapper.get<HTMLButtonElement>('[aria-label="Cerrar sesión"]').element.focus()
    await nextTick()
    expect(wrapper.find('.account-dropdown').exists()).toBe(true)
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await nextTick()
    expect(wrapper.find('.account-dropdown').exists()).toBe(false)
    outside.remove()
    wrapper.unmount()
  })
})
