import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse } from 'axios'
import UserListPanel from '@/components/users/UserListPanel.vue'
import type { UserListResult } from '@/types/user'

const { getUsers, getEmployeeListOptions } = vi.hoisted(() => ({
  getUsers: vi.fn(),
  getEmployeeListOptions: vi.fn(),
}))
vi.mock('@/services/user.service', () => ({ getUsers, getEmployeeListOptions }))
let wrapper: VueWrapper<InstanceType<typeof UserListPanel>> | undefined
const clients: UserListResult = {
  items: [
    {
      id: 42,
      name: 'Ana María Núñez',
      email: 'ana@example.com',
      phoneNumber: null,
      createdAt: null,
    },
  ],
  total: 21,
  page: 1,
  pageSize: 10,
  totalPages: 3,
}
function httpError(status: number) {
  return new AxiosError('HTTP error', undefined, undefined, undefined, {
    status,
    data: {},
  } as AxiosResponse)
}
async function render(
  section: 'clients' | 'employees' = 'clients',
  role: 'ADMINISTRATOR' | 'EMPLOYEE' = 'ADMINISTRATOR',
) {
  wrapper = mount(UserListPanel, { props: { section, role } })
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  getUsers.mockReset().mockResolvedValue(clients)
  getEmployeeListOptions.mockReset().mockResolvedValue({
    branches: [
      { id: 3, label: 'Centro' },
      { id: 5, label: 'Este' },
    ],
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('UserListPanel', () => {
  it('lists real records and a total with disabled actions and no employee filters', async () => {
    const view = await render('clients', 'EMPLOYEE')
    expect(view.text()).toContain('21 resultados')
    expect(view.text()).toContain('Ana María Núñez')
    expect(view.text()).toContain('Desconocida')
    expect(view.text()).toContain('Sin registrar')
    expect(view.find('input[name="role"]').exists()).toBe(false)
    expect(view.get('tbody td').text()).toBe('CL42')
    expect(view.findAll('th').slice(-1)[0]?.text()).toBe('Acciones')
    expect(view.findAll('.actions button').map((button) => button.text())).toEqual([
      'Ver',
      'Modificar',
      'Desactivar',
    ])
    for (const button of view.findAll('.actions button')) {
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.find('i.bi').exists()).toBe(true)
      await button.trigger('click')
    }
    expect(view.getComponent({ name: 'CrudTable' }).emitted()).toEqual({})
    expect(view.find('select[name="pageSize"]').exists()).toBe(false)
    expect(view.get('nav').text()).toBe('Página 1 de 3')
    expect(view.get('button[aria-label="Página anterior"]').attributes('disabled')).toBeDefined()
    expect(getEmployeeListOptions).not.toHaveBeenCalled()
    expect(getUsers).toHaveBeenCalledWith(
      'clients',
      { page: 1, pageSize: 10, sortBy: 'id', sortDirection: 'asc' },
      expect.any(AbortSignal),
    )
  })
  it('searches full names and surnames with normalized whitespace', async () => {
    const view = await render()
    await view.get('input').setValue('  Ana   María Núñez  ')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(getUsers).toHaveBeenLastCalledWith(
      'clients',
      expect.objectContaining({ search: 'Ana María Núñez', page: 1 }),
      expect.any(AbortSignal),
    )
    expect(view.text()).toContain('para «Ana María Núñez»')
  })
  it('shows only labeled arrows and the current page, disabling navigation at either end', async () => {
    const view = await render()
    const previous = () => view.get('button[aria-label="Página anterior"]')
    const next = () => view.get('button[aria-label="Página siguiente"]')
    expect(previous().text()).toBe('')
    expect(next().text()).toBe('')
    expect(previous().attributes('disabled')).toBeDefined()
    getUsers.mockResolvedValue({ ...clients, page: 2 })
    await next().trigger('click')
    await flushPromises()
    expect(view.get('nav').text()).toBe('Página 2 de 3')
    expect(previous().attributes('disabled')).toBeUndefined()
    getUsers.mockResolvedValue({ ...clients, page: 3 })
    await next().trigger('click')
    await flushPromises()
    expect(view.get('nav').text()).toBe('Página 3 de 3')
    expect(next().attributes('disabled')).toBeDefined()
    getUsers.mockResolvedValue({ ...clients, page: 2 })
    await previous().trigger('click')
    await flushPromises()
    expect(getUsers).toHaveBeenLastCalledWith(
      'clients',
      expect.objectContaining({ page: 2, pageSize: 10 }),
      expect.any(AbortSignal),
    )
    expect(view.get('nav').text()).toBe('Página 2 de 3')
  })
  it.each(['   ', 'é'.repeat(201), '\ud800', 'Ana\u0085María'])(
    'reports an invalid search without querying or showing zero results: %p',
    async (input) => {
      const view = await render()
      await view.get('input').setValue(input)
      await view.get('form').trigger('submit')
      await flushPromises()
      expect(getUsers).toHaveBeenCalledTimes(1)
      expect(view.get('[role="alert"]').text()).toMatch(/búsqueda|caracteres/u)
      expect(view.get('input').attributes('aria-invalid')).toBe('true')
      expect(view.find('.result-count').exists()).toBe(false)
      expect(view.find('table').exists()).toBe(false)
    },
  )
  it('reports zero matches and allows clearing the search', async () => {
    const view = await render()
    getUsers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
    await view.get('input').setValue('Sin coincidencias')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(view.text()).toContain('0 resultados')
    expect(view.text()).toContain('No hay coincidencias')
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(view.get('nav').text()).toContain('Página 0 de 0')
    expect(
      view.findAll('nav button').every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true)
    getUsers.mockResolvedValue(clients)
    await view.get('.search-bar .secondary-button').trigger('click')
    await flushPromises()
    expect(view.get<HTMLInputElement>('input').element.value).toBe('')
    expect(getUsers.mock.calls[getUsers.mock.calls.length - 1]?.[1]).not.toHaveProperty('search')
  })
  it('distinguishes an empty database from an unmatched search', async () => {
    getUsers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
    expect((await render()).text()).toContain('No hay usuarios registrados')
  })
  it('combines role and branch filters and resets pagination when filters change', async () => {
    const view = await render('employees')
    await view.get('nav button:last-child').trigger('click')
    await flushPromises()
    expect(getUsers.mock.calls[getUsers.mock.calls.length - 1]?.[1].page).toBe(2)
    await view.get('input[name="role"][value="ADMINISTRATOR"]').setValue(true)
    await view.get('input[name="role"][value="EMPLOYEE"]').setValue(true)
    await view.get('input[name="branchId"][value="3"]').setValue(true)
    await view.get('input[name="branchId"][value="5"]').setValue(true)
    await flushPromises()
    expect(getUsers).toHaveBeenLastCalledWith(
      'employees',
      expect.objectContaining({ role: ['ADMINISTRATOR', 'EMPLOYEE'], branchId: [3, 5], page: 1 }),
      expect.any(AbortSignal),
    )
    await view.get('select[name="sortBy"]').setValue('hireDate')
    await view.get('select[name="sortDirection"]').setValue('desc')
    await flushPromises()
    expect(getUsers.mock.calls[getUsers.mock.calls.length - 1]?.[1]).toMatchObject({
      sortBy: 'hireDate',
      sortDirection: 'desc',
      pageSize: 10,
    })
    await view.get('input[name="branchId"][value="3"]').setValue(false)
    await flushPromises()
    expect(getUsers.mock.calls.slice(-1)[0]?.[1].branchId).toEqual([5])
    await view.get('.search-bar .secondary-button').trigger('click')
    await flushPromises()
    expect(getUsers.mock.calls.slice(-1)[0]?.[1]).not.toHaveProperty('role')
    expect(getUsers.mock.calls.slice(-1)[0]?.[1]).not.toHaveProperty('branchId')
    expect(
      view
        .findAll<HTMLInputElement>('input[type="checkbox"]')
        .every((input) => !input.element.checked),
    ).toBe(true)
  })
  it('displays employee roles, branches and dates without shifting the hire date', async () => {
    getUsers.mockResolvedValue({
      ...clients,
      total: 1,
      items: [
        {
          ...clients.items[0],
          role: 'ADMINISTRATOR',
          branchId: 3,
          branchName: 'Centro',
          hireDate: '2026-10-01',
          createdAt: '2026-10-04T05:30:00.000Z',
        },
      ],
    })
    const view = await render('employees')
    expect(view.get('table').text()).toContain('Administrador')
    expect(view.get('tbody td').text()).toBe('ADM42')
    expect(view.findAll('th').slice(-1)[0]?.text()).toBe('Acciones')
    expect(view.findAll('.actions button')).toHaveLength(3)
    expect(view.get('table').text()).toContain('Centro')
    expect(view.get('table').text()).toContain('01/10/2026')
    expect(view.get('table').text()).toContain('03/10/2026')
    expect(view.text()).toContain('1 resultado')
  })
  it('displays unknown hire dates and employee labels', async () => {
    getUsers.mockResolvedValue({
      ...clients,
      items: [
        {
          ...clients.items[0],
          role: 'EMPLOYEE',
          branchId: 3,
          branchName: 'Centro',
          hireDate: null,
        },
      ],
    })
    expect((await render('employees')).get('tbody').text()).toContain('Empleado')
    expect(wrapper?.get('tbody').text()).toContain('Desconocida')
    expect(wrapper?.get('tbody td').text()).toBe('EMP42')
  })
  it('shows a loading status then a retryable connection error', async () => {
    let reject!: (error: Error) => void
    getUsers.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const view = await render()
    expect(view.get('[role="status"]').text()).toContain('Cargando clientes')
    reject(new Error('Connection unavailable'))
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('No se pudo cargar')
    getUsers.mockResolvedValue(clients)
    await view.get('.feedback button').trigger('click')
    await flushPromises()
    expect(view.find('table').exists()).toBe(true)
  })
  it.each([401, 403, 400])('handles HTTP %s without retaining personal records', async (status) => {
    getUsers.mockRejectedValue(httpError(status))
    const view = await render()
    expect(view.find('table').exists()).toBe(false)
    expect(view.find('[role="alert"]').exists()).toBe(true)
    expect(view.emitted('session-expired')?.length ?? 0).toBe(status === 401 ? 1 : 0)
    expect(view.emitted('forbidden')?.length ?? 0).toBe(status === 403 ? 1 : 0)
  })
  it('retries branch options without blocking the employee list', async () => {
    getEmployeeListOptions.mockRejectedValue(new Error('Connection unavailable'))
    const view = await render('employees')
    expect(view.find('table').exists()).toBe(true)
    expect(view.get('fieldset[name="branches"]').attributes('disabled')).toBeDefined()
    getEmployeeListOptions.mockResolvedValue({ branches: [{ id: 3, label: 'Centro' }] })
    await view.get('.feedback button').trigger('click')
    await flushPromises()
    expect(view.get('fieldset[name="branches"]').text()).toContain('Centro')
    expect(view.get('fieldset[name="branches"]').attributes('disabled')).toBeUndefined()
  })
  it('cancels old queries and discards late responses after a new search', async () => {
    let finish!: (value: UserListResult) => void
    getUsers.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = await render()
    const oldSignal = getUsers.mock.calls[0]?.[2] as AbortSignal
    await view.get('input').setValue('Nuevo')
    await view.get('form').trigger('submit')
    await flushPromises()
    finish({ ...clients, total: 999 })
    await flushPromises()
    expect(oldSignal.aborted).toBe(true)
    expect(view.text()).toContain('21 resultados')
    expect(view.text()).not.toContain('999 resultados')
  })
  it('clears records on permission changes and never queries employees for an employee', async () => {
    const view = await render('employees')
    await view.setProps({ role: 'EMPLOYEE' })
    await flushPromises()
    expect(view.find('table').exists()).toBe(false)
    expect(getUsers).toHaveBeenCalledTimes(1)
  })
  it('cancels both pending list and catalog requests when unmounted', async () => {
    getUsers.mockReturnValue(new Promise(() => {}))
    getEmployeeListOptions.mockReturnValue(new Promise(() => {}))
    const view = await render('employees')
    const listSignal = getUsers.mock.calls[0]?.[2] as AbortSignal
    const optionsSignal = getEmployeeListOptions.mock.calls[0]?.[0] as AbortSignal
    view.unmount()
    wrapper = undefined
    expect(listSignal.aborted).toBe(true)
    expect(optionsSignal.aborted).toBe(true)
  })
  it('refreshes the active list after an external creation', async () => {
    const view = await render()
    view.vm.refresh()
    await flushPromises()
    expect(getUsers).toHaveBeenCalledTimes(2)
  })
})
