import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse } from 'axios'
import BranchesSection from '@/components/branches/BranchesSection.vue'
import BranchDetailDialog from '@/components/branches/BranchDetailDialog.vue'
import type { BranchListItem, BranchListResult } from '@/types/branch'

const { getBranches, getCompanies, createBranch, sessionExpired, refreshPermissions } = vi.hoisted(
  () => ({
    getBranches: vi.fn(),
    getCompanies: vi.fn(),
    createBranch: vi.fn(),
    sessionExpired: vi.fn(),
    refreshPermissions: vi.fn(),
  }),
)
vi.mock('@/services/branch.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/branch.service')>(
    '@/services/branch.service',
  )
  return { ...actual, getBranches, getCompanies, createBranch }
})
vi.mock('@/composables/useEmployeeSessionRecovery', () => ({
  useEmployeeSessionRecovery: () => ({
    state: { disposed: false },
    sessionExpired,
    refreshPermissions,
  }),
}))

const branches: BranchListItem[] = [
  { id: 1, name: 'Sucursal Heredia Centro', companyId: 2, companyName: 'Cinetadel S.A' },
  { id: 6, name: null, companyId: 4, companyName: 'Cinetadel del Caribe' },
  { id: 7, name: 'Sucursal Sin Compania', companyId: 5, companyName: null },
]
function result(overrides: Partial<BranchListResult> = {}): BranchListResult {
  return { items: branches, total: 3, page: 1, pageSize: 10, totalPages: 1, ...overrides }
}
function failure(status: number) {
  return new AxiosError('HTTP failure', undefined, undefined, undefined, {
    status,
  } as AxiosResponse)
}
let wrapper: VueWrapper | undefined

async function render() {
  wrapper = mount(BranchesSection, { global: { stubs: { BranchDetailDialog: true } } })
  await flushPromises()
  return wrapper
}
const lastQuery = () => getBranches.mock.calls[getBranches.mock.calls.length - 1]?.[0]
const button = (view: VueWrapper, text: string) =>
  view.findAll('button').find((item) => item.text().includes(text))!

beforeEach(() => {
  getBranches.mockReset().mockResolvedValue(result())
  getCompanies.mockReset().mockResolvedValue([
    { id: 2, name: 'Cinetadel S.A' },
    { id: 5, name: null },
  ])
  sessionExpired.mockReset()
  refreshPermissions.mockReset()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('BranchesSection', () => {
  it('lists the active branches with Nombre, ID Sucursal and Compañía', async () => {
    const view = await render()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10 })
    expect(view.get('h1').text()).toBe('Sucursales')
    expect(view.get('.result-count').text()).toBe('3 sucursales')
    expect(view.findAll('th').map((th) => th.text())).toEqual([
      'Nombre',
      'ID Sucursal',
      'Compañía',
      'Acciones',
    ])
    const rows = view.findAll('tbody tr').map((row) => row.findAll('td').map((td) => td.text()))
    expect(rows.map((cells) => cells.slice(0, 3))).toEqual([
      ['Sucursal Heredia Centro', 'SU-001', 'Cinetadel S.A'],
      ['Sin nombre registrado', 'SU-006', 'Cinetadel del Caribe'],
      ['Sucursal Sin Compania', 'SU-007', 'Sin compañía asignada'],
    ])
    expect(view.findAll('.missing')).toHaveLength(2)
  })

  it('uses the singular for one branch', async () => {
    getBranches.mockResolvedValueOnce(result({ items: [branches[0]!], total: 1 }))
    const view = await render()
    expect(view.get('.result-count').text()).toBe('1 sucursal')
  })

  it('keeps the actions of other stories visible but disabled', async () => {
    const view = await render()
    expect(button(view, 'Crear sucursal').attributes('disabled')).toBeUndefined()
    for (const label of ['Modificar sucursal (Pendiente)', 'Desactivar sucursal (Pendiente)']) {
      const actions = view.findAll(`[aria-label="${label}"]`)
      expect(actions).toHaveLength(3)
      expect(actions.every((action) => action.attributes('disabled') !== undefined)).toBe(true)
    }
  })

  it('opens the detail of the selected branch and closes it', async () => {
    const view = await render()
    const dialog = view.getComponent(BranchDetailDialog)
    expect(dialog.props('branchId')).toBeNull()
    await view.findAll('[aria-label="Ver sucursal"]')[1]!.trigger('click')
    expect(dialog.props('branchId')).toBe(6)
    dialog.vm.$emit('session-expired')
    dialog.vm.$emit('forbidden')
    dialog.vm.$emit('close')
    await flushPromises()
    expect(dialog.props('branchId')).toBeNull()
    expect(sessionExpired).toHaveBeenCalledTimes(1)
    expect(refreshPermissions).toHaveBeenCalledTimes(1)
  })

  it('searches by name or ID, normalizing spaces, and clears the filters', async () => {
    const view = await render()
    expect(button(view, 'Limpiar filtros').attributes('disabled')).toBeDefined()
    await view.get('input[name="search"]').setValue('  SU-001   centro ')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10, search: 'SU-001 centro' })

    await button(view, 'Limpiar filtros').trigger('click')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10 })
    expect(view.get<HTMLInputElement>('input[name="search"]').element.value).toBe('')
  })

  it.each([
    ['   ', 'La búsqueda no puede contener solo espacios.'],
    ['a\u0007b', 'La búsqueda contiene caracteres no válidos.'],
    ['x'.repeat(101), 'La búsqueda no puede superar 100 caracteres.'],
  ])('rejects the search %j without calling the API', async (value, message) => {
    const view = await render()
    await view.get('input[name="search"]').setValue(value)
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(getBranches).toHaveBeenCalledTimes(1)
    expect(view.get('.feedback.error').text()).toBe(message)
    expect(view.get('input[name="search"]').attributes('aria-invalid')).toBe('true')
  })

  it('filters by company and names the companies without a name', async () => {
    const view = await render()
    const options = view
      .findAll('.filters select[name="companyId"] option')
      .map((option) => option.text())
    expect(options).toEqual(['Todas', 'Cinetadel S.A', 'Sin nombre registrado'])
    await view.get('select[name="companyId"]').setValue('2')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10, companyId: 2 })
  })

  it('distinguishes no branches from a search without matches', async () => {
    getBranches.mockResolvedValue(result({ items: [], total: 0, totalPages: 0 }))
    const view = await render()
    expect(view.get('.state-card h2').text()).toBe('No hay sucursales registradas')
    await view.get('input[name="search"]').setValue('Plaza Norte')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(view.get('.state-card h2').text()).toBe('No se encontraron sucursales')
    expect(view.get('.state-card p').text()).toBe(
      'Prueba con otro nombre o ID, o limpia los filtros.',
    )
    expect(view.find('table').exists()).toBe(false)
  })

  it('pages forward and back and changes the page size', async () => {
    getBranches.mockResolvedValue(result({ total: 25, totalPages: 3 }))
    const view = await render()
    expect(button(view, 'Anterior').attributes('disabled')).toBeDefined()
    getBranches.mockResolvedValueOnce(result({ total: 25, totalPages: 3, page: 2 }))
    await button(view, 'Siguiente').trigger('click')
    await flushPromises()
    expect(lastQuery()).toMatchObject({ page: 2 })
    expect(view.get('.current-page').text()).toContain('2')
    await button(view, 'Anterior').trigger('click')
    await flushPromises()
    expect(lastQuery()).toMatchObject({ page: 1 })

    await view.get('select[name="pageSize"]').setValue('20')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 20 })
  })

  it('does not page past the last page', async () => {
    const view = await render()
    expect(button(view, 'Siguiente').attributes('disabled')).toBeDefined()
    await button(view, 'Siguiente').trigger('click')
    expect(getBranches).toHaveBeenCalledTimes(1)
  })

  it('P-500.2: shows the load error and retries', async () => {
    getBranches.mockRejectedValueOnce(failure(500))
    const view = await render()
    expect(view.get('[role="alert"] h2').text()).toBe('No se pudieron cargar las sucursales')
    expect(view.text()).toContain('Ocurrió un error al consultar el servidor. Intenta de nuevo.')
    expect(view.find('.pagination-bar').exists()).toBe(false)
    await button(view, 'Reintentar').trigger('click')
    await flushPromises()
    expect(view.findAll('tbody tr')).toHaveLength(3)
  })

  it('answers 403 with the permission message and rechecks the session', async () => {
    getBranches.mockRejectedValueOnce(failure(403))
    const view = await render()
    expect(view.get('[role="alert"] h2').text()).toBe(
      'No tiene permisos para acceder a esta sección',
    )
    expect(refreshPermissions).toHaveBeenCalled()
  })

  it('leaves the dashboard when the session expired', async () => {
    getBranches.mockRejectedValueOnce(failure(401))
    await render()
    expect(sessionExpired).toHaveBeenCalled()
  })

  it('shows a 400 answer as an invalid search', async () => {
    getBranches.mockRejectedValueOnce(failure(400))
    const view = await render()
    expect(view.get('.feedback.error').text()).toBe(
      'La búsqueda o el filtro no son válidos. Revisa los valores e inténtalo de nuevo.',
    )
  })

  it('disables the company filter when the companies fail and retries them', async () => {
    getCompanies.mockRejectedValueOnce(failure(500))
    const view = await render()
    expect(view.get('select[name="companyId"]').attributes('disabled')).toBeDefined()
    expect(view.get('.filter-error').text()).toContain('No se pudieron cargar las compañías.')
    await view.get('.filter-error button').trigger('click')
    await flushPromises()
    expect(view.get('select[name="companyId"]').attributes('disabled')).toBeUndefined()
  })

  it('ignores an answer that arrives after a newer request', async () => {
    let resolveFirst!: (value: BranchListResult) => void
    getBranches.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
    wrapper = mount(BranchesSection, { global: { stubs: { BranchDetailDialog: true } } })
    getBranches.mockResolvedValueOnce(result({ items: [branches[2]!], total: 1 }))
    await wrapper.get('select[name="companyId"]').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    resolveFirst(result())
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  })
})

describe('BranchesSection · Crear sucursal', () => {
  const created = {
    id: 30,
    name: 'Sucursal Heredia Centro',
    companyId: 2,
    companyName: 'Cinetadel S.A',
    status: 'ACTIVE',
  }
  const dialog = (view: VueWrapper) => view.get('form.branch-form')

  async function openAndFill(view: VueWrapper, name = 'Sucursal Heredia Centro') {
    await button(view, 'Crear sucursal').trigger('click')
    await dialog(view).get('input[name="name"]').setValue(name)
    await dialog(view).get('select[name="companyId"]').setValue('2')
    await dialog(view).trigger('submit')
    await flushPromises()
  }

  beforeEach(() => {
    createBranch.mockReset()
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: vi.fn(),
    })
  })
  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  })

  it('creates the branch, shows the success toast and reloads the list (UT-015)', async () => {
    let finish!: (value: typeof created) => void
    createBranch.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const view = await render()
    await openAndFill(view)
    expect(createBranch).toHaveBeenCalledWith({ name: 'Sucursal Heredia Centro', companyId: 2 })
    expect(view.emitted('busy')).toEqual([[true]])
    expect(button(view, 'Crear sucursal').attributes('disabled')).toBeDefined()

    const loads = getBranches.mock.calls.length
    finish(created)
    await flushPromises()
    expect(view.emitted('busy')).toEqual([[true], [false]])
    expect(view.get('.branch-notification').text()).toContain('Sucursal creada con éxito')
    expect(getBranches.mock.calls.length).toBe(loads + 1)
    expect((dialog(view).get('input[name="name"]').element as HTMLInputElement).value).toBe('')

    await view.get('.branch-notification .notification-popup').trigger('click')
    expect(view.find('.branch-notification').exists()).toBe(false)
  })

  it('keeps the form data and shows the error when saving fails (UT-014)', async () => {
    createBranch.mockRejectedValueOnce(new Error('Network Error'))
    const view = await render()
    await openAndFill(view, 'Sucursal Liberia')
    expect(dialog(view).get('.form-error').text()).toBe(
      'No se pudo crear la sucursal, intenta de nuevo',
    )
    expect((dialog(view).get('input[name="name"]').element as HTMLInputElement).value).toBe(
      'Sucursal Liberia',
    )
    expect(view.find('.branch-notification').exists()).toBe(false)
  })

  it('shows the API field errors under their fields', async () => {
    const error = failure(400)
    error.response!.data = { message: 'Debe seleccionar una compañía' }
    createBranch.mockRejectedValueOnce(error)
    const view = await render()
    await openAndFill(view)
    const select = dialog(view).get('select[name="companyId"]')
    expect(select.attributes('aria-invalid')).toBe('true')
    expect(dialog(view).find('.form-error').exists()).toBe(false)
  })

  it('shows a name already used by an active branch under the name field', async () => {
    const error = failure(409)
    error.response!.data = { message: 'Ya existe una sucursal activa con ese nombre' }
    createBranch.mockRejectedValueOnce(error)
    const view = await render()
    await openAndFill(view, 'Sucursal Heredia Oeste')
    const name = dialog(view).get('input[name="name"]')
    expect(name.attributes('aria-invalid')).toBe('true')
    expect(dialog(view).get('.field-error').text()).toBe(
      'Ya existe una sucursal activa con ese nombre',
    )
    expect((name.element as HTMLInputElement).value).toBe('Sucursal Heredia Oeste')
    expect(dialog(view).find('.form-error').exists()).toBe(false)
  })

  it.each([
    [403, 'No tiene permisos para acceder a esta sección'],
    [400, 'No se pudo crear la sucursal, intenta de nuevo'],
  ])('shows the message for a %i answer', async (status, message) => {
    createBranch.mockRejectedValueOnce(failure(status))
    const view = await render()
    await openAndFill(view)
    expect(dialog(view).get('.form-error').text()).toBe(message)
    if (status === 403) expect(refreshPermissions).toHaveBeenCalled()
  })

  it('leaves the dashboard when the session expired while saving', async () => {
    createBranch.mockRejectedValueOnce(failure(401))
    const view = await render()
    await openAndFill(view)
    expect(sessionExpired).toHaveBeenCalled()
  })

  it('reloads the companies when the form opens after they failed', async () => {
    getCompanies.mockRejectedValueOnce(failure(500))
    const view = await render()
    await button(view, 'Crear sucursal').trigger('click')
    await flushPromises()
    expect(getCompanies).toHaveBeenCalledTimes(2)
    expect(
      dialog(view)
        .findAll('select[name="companyId"] option')
        .map((option) => option.text()),
    ).toEqual(['Selecciona una compañía', 'Cinetadel S.A'])
  })

  it('does not open the form while the dashboard is busy', async () => {
    wrapper = mount(BranchesSection, {
      props: { disabled: true },
      global: { stubs: { BranchDetailDialog: true } },
    })
    await flushPromises()
    await button(wrapper, 'Crear sucursal').trigger('click')
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled()
  })
})
