import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PaginationControls from '@/components/common/PaginationControls.vue'

describe('PaginationControls', () => {
  it('shows the current and total pages and emits navigation without submitting forms', async () => {
    const view = mount(PaginationControls, {
      props: { page: 2, totalPages: 4, label: 'Paginación de prueba' },
    })
    expect(view.get('nav').attributes('aria-label')).toBe('Paginación de prueba')
    expect(view.text()).toBe('Página 2 de 4')
    expect(view.findAll('button').every((button) => button.attributes('type') === 'button')).toBe(
      true,
    )
    await view.get('[aria-label="Página anterior"]').trigger('click')
    await view.get('[aria-label="Página siguiente"]').trigger('click')
    expect(view.emitted('change')).toEqual([[1], [3]])
    view.unmount()
  })
  it.each([0, 1])('disables both directions with %s pages', async (totalPages) => {
    const view = mount(PaginationControls, { props: { page: 1, totalPages } })
    expect(view.text()).toBe(`Página ${totalPages} de ${totalPages}`)
    for (const button of view.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined()
      await button.trigger('click')
    }
    expect(view.emitted('change')).toBeUndefined()
    view.unmount()
  })
  it('respects the page boundaries and pending requests', async () => {
    const view = mount(PaginationControls, { props: { page: 1, totalPages: 3 } })
    expect(view.get('[aria-label="Página anterior"]').attributes('disabled')).toBeDefined()
    await view.setProps({ page: 3 })
    expect(view.get('[aria-label="Página siguiente"]').attributes('disabled')).toBeDefined()
    await view.setProps({ page: 2, disabled: true })
    for (const button of view.findAll('button')) await button.trigger('click')
    expect(view.emitted('change')).toBeUndefined()
    expect(view.get('[aria-current="page"]').text()).toBe('Página 2 de 3')
    view.unmount()
  })
})
